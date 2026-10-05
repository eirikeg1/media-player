import { getSportsDatabase } from '@/services/sports-service';
import { resetSportsCacheEpoch } from '@/test/helpers';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { Fixture, FixtureWindow, SportsDatabase } from 'expo-m3u-parser';

import { addDays } from '../date-utils';
import { TTL_FAVORITES_SECS, TTL_TODAY_SECS } from '../fixture-fetch';
import { useDayFixtures } from '../hooks/use-day-fixtures';
import { bumpSportsCacheEpoch } from '../sports-cache-epoch';

const NOW = new Date('2026-06-12T12:00:00Z');
/** Index of `maxAgeSecs` in a `getFixturesForWindow` call. */
const DAY_TTL_ARG = 2;
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

/**
 * How often the hook re-reads a day it was served stale, and for how long.
 * Mirrors `RECHECK_POLL_MS` / `RECHECK_MAX_MS` in the hook, which are private.
 */
const RECHECK_POLL_MS = 2_000;
const RECHECK_MAX_MS = 15_000;

/** The in-memory fake behind the `expo-m3u-parser` mock. */
type FakeSportsDatabase = SportsDatabase & {
  __fixtures: Fixture[];
  __staleWindow: boolean;
  __clear: () => void;
};

let db: FakeSportsDatabase;

beforeEach(async () => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  resetSportsCacheEpoch();
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
    const day = jest.spyOn(db, 'getFixturesForWindow');

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
    const day = jest.spyOn(db, 'getFixturesForWindow');
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
    expect(day.mock.calls[1][DAY_TTL_ARG]).toBe(Number.MAX_SAFE_INTEGER);
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

  it('stands the silent poll down while a pull-to-refresh is in flight', async () => {
    const { result } = await renderHook(() => useDayFixtures(NOW, [ARSENAL], true));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // A force read that has not come back yet: it is the fan-out the user asked
    // for, and a cache-only silent poll would win the race and discard it.
    let releaseForce!: (window: FixtureWindow) => void;
    const day = jest
      .spyOn(db, 'getFixturesForWindow')
      .mockReturnValueOnce(new Promise<FixtureWindow>((resolve) => (releaseForce = resolve)));
    const live = jest.spyOn(db, 'refreshLiveFixtures');

    const refreshing = result.current.refresh();
    await waitFor(() => expect(day).toHaveBeenCalledTimes(1));

    await act(async () => {
      jest.advanceTimersByTime(15 * 60_000);
    });

    // Every tick in that quarter of an hour returned without touching the
    // provider or re-reading the day.
    expect(live).not.toHaveBeenCalled();
    expect(day).toHaveBeenCalledTimes(1);

    const refreshed = fixture({ status: 'in_progress', homeScore: 3, awayScore: 0 });
    await act(async () => {
      releaseForce({ fixtures: [refreshed], stale: false });
      await refreshing;
    });
    expect(result.current.fixtures[0].homeScore).toBe(3);
  });

  /** Renders the hook with a swappable day, on today's schedule. */
  function renderForDay(date: Date = NOW) {
    return renderHook(({ day }: { day: Date }) => useDayFixtures(day, [ARSENAL], true), {
      initialProps: { day: date },
    });
  }

  it('renders a revisited day from cache and revalidates it behind the list', async () => {
    const day = jest.spyOn(db, 'getFixturesForWindow');
    const { result, rerender } = await renderForDay();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.fixtures).toHaveLength(1);

    await rerender({ day: TOMORROW });
    await waitFor(() => expect(result.current.fixtures).toHaveLength(0));

    // Never answering proves the rows on screen came from the cache, not the read.
    day.mockReturnValue(new Promise<FixtureWindow>(() => {}));
    await rerender({ day: NOW });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.fixtures).toHaveLength(1);
    // The revalidate still refetches a stale day, at the normal TTL.
    await waitFor(() => expect(day).toHaveBeenCalledTimes(3));
    expect(day.mock.calls[2][DAY_TTL_ARG]).toBe(TTL_TODAY_SECS);
  });

  it('keeps the cached day when its revalidate read fails', async () => {
    const day = jest.spyOn(db, 'getFixturesForWindow');
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

  it('refetches a cached day after the caches are invalidated', async () => {
    const day = jest.spyOn(db, 'getFixturesForWindow');
    const { result, rerender } = await renderForDay();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Visit tomorrow and come back, so today is served from the in-memory cache.
    await rerender({ day: TOMORROW });
    await waitFor(() => expect(result.current.fixtures).toHaveLength(0));
    await rerender({ day: NOW });
    await waitFor(() => expect(result.current.fixtures).toHaveLength(1));
    const reads = day.mock.calls.length;

    db.__fixtures = [fixture({ status: 'in_progress', homeScore: 2, awayScore: 1 })];
    await act(async () => {
      bumpSportsCacheEpoch();
    });

    // The cached rows described the data the user just asked to replace, so the
    // day is read again — behind the list, which is never replaced by a spinner.
    await waitFor(() => expect(result.current.fixtures[0].homeScore).toBe(2));
    expect(day.mock.calls.length).toBeGreaterThan(reads);
    expect(result.current.isLoading).toBe(false);
  });

  describe('a day served while its schedule is still being fetched', () => {
    it('shows the cached rows at once, then rechecks until the refresh lands', async () => {
      db.__staleWindow = true;
      const day = jest.spyOn(db, 'getFixturesForWindow');

      const { result } = await renderHook(() => useDayFixtures(NOW, [ARSENAL], true));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // Rows rather than a skeleton, plus the quiet note that they may change.
      expect(result.current.fixtures).toHaveLength(1);
      expect(result.current.isRevalidating).toBe(true);

      // The native fan-out lands: a second match, and no refresh in flight.
      db.__fixtures = [fixture(), fixture({ providerId: 2, homeTeam: 'Spurs' })];
      db.__staleWindow = false;
      await act(async () => {
        jest.advanceTimersByTime(RECHECK_POLL_MS);
      });

      await waitFor(() => expect(result.current.isRevalidating).toBe(false));
      expect(result.current.fixtures).toHaveLength(2);
      // The whole wait cost nothing: every recheck asked for the cache alone.
      expect(day).toHaveBeenCalledTimes(2);
      expect(day.mock.calls[1][DAY_TTL_ARG]).toBe(Number.MAX_SAFE_INTEGER);

      // And it stops there rather than polling on.
      await act(async () => {
        jest.advanceTimersByTime(4 * RECHECK_POLL_MS);
      });
      expect(day).toHaveBeenCalledTimes(2);
    });

    it('never rechecks a day the native side answered outright', async () => {
      const day = jest.spyOn(db, 'getFixturesForWindow');

      const { result } = await renderHook(() => useDayFixtures(NOW, [ARSENAL], true));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.isRevalidating).toBe(false);
      await act(async () => {
        jest.advanceTimersByTime(3 * RECHECK_POLL_MS);
      });
      expect(day).toHaveBeenCalledTimes(1);
    });

    it('gives the refresh a deadline rather than rechecking for the session', async () => {
      // The fan-out never lands — the provider is refusing us.
      db.__staleWindow = true;
      const day = jest.spyOn(db, 'getFixturesForWindow');

      const { result } = await renderHook(() => useDayFixtures(NOW, [ARSENAL], true));
      await waitFor(() => expect(result.current.isRevalidating).toBe(true));

      await act(async () => {
        jest.advanceTimersByTime(RECHECK_MAX_MS + RECHECK_POLL_MS);
      });
      await waitFor(() => expect(result.current.isRevalidating).toBe(false));

      const reads = day.mock.calls.length;
      await act(async () => {
        jest.advanceTimersByTime(4 * RECHECK_POLL_MS);
      });
      expect(day).toHaveBeenCalledTimes(reads);
    });
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
