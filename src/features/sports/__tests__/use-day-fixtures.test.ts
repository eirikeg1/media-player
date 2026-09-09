import { getSportsDatabase } from '@/services/sports-service';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { Fixture, SportsDatabase } from 'expo-m3u-parser';

import { addDays } from '../date-utils';
import { TTL_FAVORITES_SECS, TTL_TODAY_SECS } from '../fixture-fetch';
import { useDayFixtures } from '../hooks/use-day-fixtures';

const NOW = new Date('2026-06-12T12:00:00Z');
const TOMORROW = addDays(NOW, 1);
const ARSENAL = 42;

function fixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    providerId: 1,
    provider: 'sofascore',
    competitionName: 'Premier League',
    competitionId: 17,
    competitionCountry: 'England',
    homeTeam: 'Arsenal',
    homeTeamId: ARSENAL,
    awayTeam: 'Chelsea',
    awayTeamId: 38,
    kickoffTime: Math.floor(NOW.getTime() / 1000) + 3600,
    status: 'scheduled',
    ...overrides,
  };
}

/** The in-memory fake behind the `expo-m3u-parser` mock. */
type FakeSportsDatabase = SportsDatabase & { __fixtures: Fixture[]; __clear: () => void };

let db: FakeSportsDatabase;

beforeEach(async () => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  db = (await getSportsDatabase()) as FakeSportsDatabase;
  db.__clear();
  db.__fixtures = [fixture()];
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('useDayFixtures', () => {
  it('fetches favorite teams before reading the day schedule', async () => {
    const teams = jest.spyOn(db, 'getFixturesForTeams');
    const day = jest.spyOn(db, 'getFixturesForDate');

    const { result } = await renderHook(() => useDayFixtures(NOW, [ARSENAL], true));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(teams).toHaveBeenCalledTimes(1);
    expect(teams.mock.calls[0][0]).toEqual([ARSENAL]);
    expect(day).toHaveBeenCalledTimes(1);
    // Favorites must be stored before the day is read out of the same cache.
    expect(teams.mock.invocationCallOrder[0]).toBeLessThan(day.mock.invocationCallOrder[0]);
    expect(result.current.fixtures).toHaveLength(1);
  });

  it('skips the team fetch when there are no favorites', async () => {
    const teams = jest.spyOn(db, 'getFixturesForTeams');

    const { result } = await renderHook(() => useDayFixtures(NOW, [], true));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(teams).not.toHaveBeenCalled();
  });

  it('keeps the day schedule fan-out out of a favorite team fetch failure', async () => {
    jest.spyOn(db, 'getFixturesForTeams').mockRejectedValue(new Error('provider down'));

    const { result } = await renderHook(() => useDayFixtures(NOW, [ARSENAL], true));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.fixtures).toHaveLength(1);
  });

  it('polls with a single live refresh and never re-triggers the fan-out', async () => {
    const teams = jest.spyOn(db, 'getFixturesForTeams');
    const day = jest.spyOn(db, 'getFixturesForDate');
    const live = jest.spyOn(db, 'refreshLiveFixtures');

    const { result } = await renderHook(() => useDayFixtures(NOW, [ARSENAL], true));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      jest.advanceTimersByTime(5 * 60_000);
    });
    await waitFor(() => expect(live).toHaveBeenCalledTimes(1));

    // One request per poll: the live refresh. No repeat of the team fetch...
    expect(teams).toHaveBeenCalledTimes(1);
    // ...and the day re-read is cache-only, so its fan-out cannot fire.
    expect(day).toHaveBeenCalledTimes(2);
    expect(day.mock.calls[1][3]).toBe(Number.MAX_SAFE_INTEGER);
    expect(live.mock.invocationCallOrder[0]).toBeLessThan(day.mock.invocationCallOrder[1]);
  });

  it('polls only while the screen is active, and catches up when it returns', async () => {
    const live = jest.spyOn(db, 'refreshLiveFixtures');
    const { result, rerender } = await renderHook(
      ({ active }: { active: boolean }) => useDayFixtures(NOW, [ARSENAL], active),
      { initialProps: { active: true } }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      jest.advanceTimersByTime(5 * 60_000);
    });
    await waitFor(() => expect(live).toHaveBeenCalledTimes(1));

    // Another tab, or the app in the background: tabs stay mounted, so without
    // this the poll would run for the rest of the process.
    await rerender({ active: false });
    await act(async () => {
      jest.advanceTimersByTime(30 * 60_000);
    });
    expect(live).toHaveBeenCalledTimes(1);

    // Back on screen: one immediate silent load, since the rows on it are as
    // old as the absence — not a wait for the next interval.
    await rerender({ active: true });
    await waitFor(() => expect(live).toHaveBeenCalledTimes(2));
  });

  it('keeps the same fixtures array when a poll changes nothing', async () => {
    const live = jest.spyOn(db, 'refreshLiveFixtures');
    const { result } = await renderHook(() => useDayFixtures(NOW, [ARSENAL], true));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const loaded = result.current.fixtures;

    await act(async () => {
      jest.advanceTimersByTime(5 * 60_000);
    });
    await waitFor(() => expect(live).toHaveBeenCalledTimes(1));

    // Identical rows must keep their identity, or every memoised row below
    // re-renders once a minute for an unchanged scoreline.
    expect(result.current.fixtures).toBe(loaded);

    db.__fixtures = [fixture({ status: 'in_progress', homeScore: 1, awayScore: 0 })];
    await act(async () => {
      jest.advanceTimersByTime(5 * 60_000);
    });

    await waitFor(() => expect(result.current.fixtures).not.toBe(loaded));
    expect(result.current.fixtures[0].homeScore).toBe(1);
  });

  it('does not poll for a day that is not today', async () => {
    const live = jest.spyOn(db, 'refreshLiveFixtures');
    const tomorrow = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);

    const { result } = await renderHook(() => useDayFixtures(tomorrow, [ARSENAL], true));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      jest.advanceTimersByTime(10 * 60_000);
    });

    expect(live).not.toHaveBeenCalled();
  });

  it('reloads silently when the favorite set changes', async () => {
    const teams = jest.spyOn(db, 'getFixturesForTeams');

    const { result, rerender } = await renderHook(
      ({ ids }: { ids: number[] }) => useDayFixtures(NOW, ids, true),
      { initialProps: { ids: [ARSENAL] } }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await rerender({ ids: [ARSENAL, 38] });

    await waitFor(() => expect(teams).toHaveBeenCalledTimes(2));
    expect(teams.mock.calls[1][0]).toEqual([ARSENAL, 38]);
    // Silent: the list on screen is never replaced by a spinner.
    expect(result.current.isLoading).toBe(false);
  });

  /** Renders the hook with a swappable day, on today's schedule. */
  function renderForDay(date: Date = NOW) {
    return renderHook(({ day }: { day: Date }) => useDayFixtures(day, [ARSENAL], true), {
      initialProps: { day: date },
    });
  }

  it('renders a revisited day from cache and revalidates it behind the list', async () => {
    const day = jest.spyOn(db, 'getFixturesForDate');
    const { result, rerender } = await renderForDay();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.fixtures).toHaveLength(1);

    await rerender({ day: TOMORROW });
    await waitFor(() => expect(result.current.fixtures).toHaveLength(0));

    // Never answering proves the rows on screen came from the cache, not the read.
    day.mockReturnValue(new Promise<Fixture[]>(() => {}));
    await rerender({ day: NOW });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.fixtures).toHaveLength(1);
    // The revalidate still refetches a stale day, at the normal TTL.
    await waitFor(() => expect(day).toHaveBeenCalledTimes(3));
    expect(day.mock.calls[2][3]).toBe(TTL_TODAY_SECS);
  });

  it('keeps the cached day when its revalidate read fails', async () => {
    const day = jest.spyOn(db, 'getFixturesForDate');
    const { result, rerender } = await renderForDay();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await rerender({ day: TOMORROW });
    await waitFor(() => expect(result.current.fixtures).toHaveLength(0));

    day.mockRejectedValue(new Error('read failed'));
    await rerender({ day: NOW });
    await waitFor(() => expect(day).toHaveBeenCalledTimes(3));

    expect(result.current.fixtures).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it('reuses one favorite team fetch for every day inside its window', async () => {
    const teams = jest.spyOn(db, 'getFixturesForTeams');
    const { result, rerender } = await renderForDay();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(teams).toHaveBeenCalledTimes(1);

    // Inside the fetched window: those days are already in the per-team cache.
    await rerender({ day: addDays(NOW, 3) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(teams).toHaveBeenCalledTimes(1);

    // Past its lookahead, so the favorites have to be fetched again.
    await rerender({ day: addDays(NOW, 20) });
    await waitFor(() => expect(teams).toHaveBeenCalledTimes(2));

    // A pull-to-refresh always refetches, ignoring the window and the TTL.
    await act(async () => {
      await result.current.refresh();
    });
    expect(teams).toHaveBeenCalledTimes(3);
    expect(teams.mock.calls[2][5]).toBe(0);
  });

  it('refetches the favorites once the covering fetch has aged past its TTL', async () => {
    const teams = jest.spyOn(db, 'getFixturesForTeams');
    const { result, rerender } = await renderForDay();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(teams).toHaveBeenCalledTimes(1);

    // Inside the window and still fresh: served from the per-team cache.
    await rerender({ day: addDays(NOW, 3) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(teams).toHaveBeenCalledTimes(1);

    // Same window, but the rows it stored are now stale — a session left open
    // all day must still pick up a favorite's newly scheduled match.
    jest.setSystemTime(new Date(NOW.getTime() + (TTL_FAVORITES_SECS + 1) * 1000));
    await rerender({ day: addDays(NOW, 4) });

    await waitFor(() => expect(teams).toHaveBeenCalledTimes(2));
  });
});
