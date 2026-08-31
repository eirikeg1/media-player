import { getSportsDatabase } from '@/services/sports-service';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { Fixture, SportsDatabase } from 'expo-m3u-parser';

import { useDayFixtures } from '../hooks/use-day-fixtures';

const NOW = new Date('2026-06-12T12:00:00Z');
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

    const { result } = await renderHook(() => useDayFixtures(NOW, [ARSENAL]));

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

    const { result } = await renderHook(() => useDayFixtures(NOW, []));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(teams).not.toHaveBeenCalled();
  });

  it('keeps the day schedule fan-out out of a favorite team fetch failure', async () => {
    jest.spyOn(db, 'getFixturesForTeams').mockRejectedValue(new Error('provider down'));

    const { result } = await renderHook(() => useDayFixtures(NOW, [ARSENAL]));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.fixtures).toHaveLength(1);
  });

  it('polls with a single live refresh and never re-triggers the fan-out', async () => {
    const teams = jest.spyOn(db, 'getFixturesForTeams');
    const day = jest.spyOn(db, 'getFixturesForDate');
    const live = jest.spyOn(db, 'refreshLiveFixtures');

    const { result } = await renderHook(() => useDayFixtures(NOW, [ARSENAL]));
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

  it('does not poll for a day that is not today', async () => {
    const live = jest.spyOn(db, 'refreshLiveFixtures');
    const tomorrow = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);

    const { result } = await renderHook(() => useDayFixtures(tomorrow, [ARSENAL]));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      jest.advanceTimersByTime(10 * 60_000);
    });

    expect(live).not.toHaveBeenCalled();
  });

  it('reloads silently when the favorite set changes', async () => {
    const teams = jest.spyOn(db, 'getFixturesForTeams');

    const { result, rerender } = await renderHook(
      ({ ids }: { ids: number[] }) => useDayFixtures(NOW, ids),
      { initialProps: { ids: [ARSENAL] } }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await rerender({ ids: [ARSENAL, 38] });

    await waitFor(() => expect(teams).toHaveBeenCalledTimes(2));
    expect(teams.mock.calls[1][0]).toEqual([ARSENAL, 38]);
    // Silent: the list on screen is never replaced by a spinner.
    expect(result.current.isLoading).toBe(false);
  });
});
