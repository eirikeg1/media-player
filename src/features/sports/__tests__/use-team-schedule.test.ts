import { getSportsDatabase } from '@/services/sports-service';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { Fixture, SportsDatabase } from 'expo-m3u-parser';

import { TTL_FAVORITES_SECS } from '../fixture-fetch';
import { useTeamSchedule } from '../hooks/use-team-schedule';

const NOW = new Date(2026, 8, 1, 12, 0, 0); // Tue 1 Sep 2026, local time.
const ARSENAL = 42;

/** Unix seconds for a local wall-clock time relative to {@link NOW}. */
function at(dayOffset: number, hour: number): number {
  const date = new Date(NOW);
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, 0, 0, 0);
  return Math.floor(date.getTime() / 1000);
}

function fixture(kickoffTime: number, overrides: Partial<Fixture> = {}): Fixture {
  return {
    providerId: kickoffTime,
    provider: 'sofascore',
    competitionName: 'Premier League',
    competitionId: 17,
    homeTeam: 'Arsenal',
    homeTeamId: ARSENAL,
    awayTeam: 'Chelsea',
    awayTeamId: 38,
    kickoffTime,
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
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('useTeamSchedule', () => {
  it('reads a six-month window from today at the favorites TTL', async () => {
    const teamFixtures = jest.spyOn(db, 'getTeamFixtures');

    const { result } = await renderHook(() => useTeamSchedule(ARSENAL));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(teamFixtures).toHaveBeenCalledTimes(1);
    const [teamId, from, to, fromTs, toTs, maxAge] = teamFixtures.mock.calls[0];
    expect(teamId).toBe(ARSENAL);
    expect(from).toBe('2026-09-01');
    expect(to).toBe('2027-02-28');
    expect(fromTs).toBe(at(0, 0));
    expect(toTs).toBe(at(180, 0) + 86_399);
    expect(maxAge).toBe(TTL_FAVORITES_SECS);
  });

  it('keeps only unfinished fixtures from today onwards, soonest first', async () => {
    db.__fixtures = [
      fixture(at(3, 18)),
      fixture(at(0, 10), { status: 'finished' }),
      fixture(at(0, 20), { status: 'in_progress' }),
      fixture(at(1, 15), { status: 'postponed' }),
    ];

    const { result } = await renderHook(() => useTeamSchedule(ARSENAL));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.fixtures.map((f) => f.kickoffTime)).toEqual([at(0, 20), at(3, 18)]);
    expect(result.current.error).toBeNull();
  });

  it('fetches nothing without a team', async () => {
    const teamFixtures = jest.spyOn(db, 'getTeamFixtures');

    const { result } = await renderHook(() => useTeamSchedule(null));

    expect(teamFixtures).not.toHaveBeenCalled();
    expect(result.current.fixtures).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('surfaces a failed read as an error', async () => {
    jest.spyOn(db, 'getTeamFixtures').mockRejectedValue(new Error('provider down'));

    const { result } = await renderHook(() => useTeamSchedule(ARSENAL));

    await waitFor(() => expect(result.current.error).toBe('provider down'));
    expect(result.current.fixtures).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('refetches for another team', async () => {
    const teamFixtures = jest.spyOn(db, 'getTeamFixtures');

    const { result, rerender } = await renderHook(({ id }: { id: number }) => useTeamSchedule(id), {
      initialProps: { id: ARSENAL },
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await rerender({ id: 38 });

    await waitFor(() => expect(teamFixtures).toHaveBeenCalledTimes(2));
    expect(teamFixtures.mock.calls[1][0]).toBe(38);
  });
});
