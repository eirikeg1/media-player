import { getSportsDatabase } from '@/services/sports-service';
import { __resetM3uFake } from '@/test/fakes/m3u-database-fake';
import type { Fixture, SportsDatabase, Team } from 'expo-m3u-parser';

import { runForegroundRefresh, warmAdjacentDays } from '../background/foreground-refresh';
import { localDateKey } from '../date-utils';
import { TTL_FAVORITES_SECS, TTL_FUTURE_SECS, TTL_PAST_SECS, TTL_TODAY_SECS } from '../fixture-fetch';

const ARSENAL: Team = {
  providerId: 42,
  provider: 'sofascore',
  name: 'Arsenal',
  shortName: 'Arsenal',
  tla: 'ARS',
};

/** Index of the `maxAgeSecs` argument in each of the two fetches under test. */
const TEAMS_TTL_ARG = 5;
const DAY_TTL_ARG = 3;

let db: SportsDatabase;

/** A promise plus the handles to settle it, for driving overlapping calls. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Let every pending microtask and timer callback run. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(async () => {
  __resetM3uFake();
  db = await getSportsDatabase();
  await db.addFavoriteTeam(ARSENAL);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('runForegroundRefresh', () => {
  it('fetches the favorites before the day schedule, with the standard TTLs', async () => {
    const teams = jest.spyOn(db, 'getFixturesForTeams');
    const day = jest.spyOn(db, 'getFixturesForDate');

    await runForegroundRefresh();

    expect(teams).toHaveBeenCalledTimes(1);
    expect(teams.mock.calls[0][0]).toEqual([ARSENAL.providerId]);
    expect(teams.mock.calls[0][TEAMS_TTL_ARG]).toBe(TTL_FAVORITES_SECS);
    expect(day).toHaveBeenCalledTimes(1);
    expect(day.mock.calls[0][DAY_TTL_ARG]).toBe(TTL_TODAY_SECS);
    expect(teams.mock.invocationCallOrder[0]).toBeLessThan(day.mock.invocationCallOrder[0]);
  });

  it('drops both TTLs to zero when forced', async () => {
    const teams = jest.spyOn(db, 'getFixturesForTeams');
    const day = jest.spyOn(db, 'getFixturesForDate');

    await runForegroundRefresh({ force: true });

    expect(teams.mock.calls[0][TEAMS_TTL_ARG]).toBe(0);
    expect(day.mock.calls[0][DAY_TTL_ARG]).toBe(0);
  });

  it('invalidates the derived caches before a forced refetch, and only then', async () => {
    const invalidate = jest.spyOn(db, 'invalidateSportsCaches');
    const day = jest.spyOn(db, 'getFixturesForDate');

    await runForegroundRefresh();
    expect(invalidate).not.toHaveBeenCalled();

    await runForegroundRefresh({ force: true });

    expect(invalidate).toHaveBeenCalledTimes(1);
    // Nothing refetched over a cache that is still marked fresh.
    expect(invalidate.mock.invocationCallOrder[0]).toBeLessThan(day.mock.invocationCallOrder[1]);
  });

  it('skips the team fetch when there are no favorites', async () => {
    await db.removeFavoriteTeam(ARSENAL.provider, ARSENAL.providerId);
    const teams = jest.spyOn(db, 'getFixturesForTeams');
    const day = jest.spyOn(db, 'getFixturesForDate');

    await runForegroundRefresh();

    expect(teams).not.toHaveBeenCalled();
    expect(day).toHaveBeenCalledTimes(1);
  });

  it('still refreshes the day schedule when the favorites cannot be read', async () => {
    jest.spyOn(db, 'getFavoriteTeams').mockRejectedValue(new Error('sports db locked'));
    const day = jest.spyOn(db, 'getFixturesForDate');

    await expect(runForegroundRefresh()).resolves.toBeUndefined();

    expect(day).toHaveBeenCalledTimes(1);
  });

  it('joins a run already in flight instead of starting a second one', async () => {
    const pending = deferred<Fixture[]>();
    const day = jest.spyOn(db, 'getFixturesForDate').mockReturnValue(pending.promise);

    const first = runForegroundRefresh();
    const second = runForegroundRefresh({ force: true });

    // The second caller must not fan out again — not even with different options.
    await flush();
    expect(day).toHaveBeenCalledTimes(1);
    expect(day.mock.calls[0][DAY_TTL_ARG]).toBe(TTL_TODAY_SECS);

    pending.resolve([]);
    await Promise.all([first, second]);
    expect(day).toHaveBeenCalledTimes(1);
  });

  it('releases the guard so a later call runs again', async () => {
    const day = jest.spyOn(db, 'getFixturesForDate');

    await runForegroundRefresh();
    await runForegroundRefresh();

    expect(day).toHaveBeenCalledTimes(2);
  });

  it('rejects when the day schedule fails, and lets the next call retry', async () => {
    const day = jest
      .spyOn(db, 'getFixturesForDate')
      .mockRejectedValueOnce(new Error('provider down'));

    await expect(runForegroundRefresh()).rejects.toThrow('provider down');

    await expect(runForegroundRefresh()).resolves.toBeUndefined();
    expect(day).toHaveBeenCalledTimes(2);
  });
});

describe('warmAdjacentDays', () => {
  /** The local date `offset` days from now, as the provider date string. */
  function dateKey(offset: number): string {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return localDateKey(date);
  }

  it('warms yesterday and the next five days, each at the day view\'s own TTL', async () => {
    const day = jest.spyOn(db, 'getFixturesForDate');

    await warmAdjacentDays();

    expect(day).toHaveBeenCalledTimes(6);
    const byDate = new Map(day.mock.calls.map((call) => [call[0], call[3]]));
    expect([...byDate.keys()].sort()).toEqual(
      [-1, 1, 2, 3, 4, 5].map(dateKey).sort()
    );
    expect(byDate.get(dateKey(-1))).toBe(TTL_PAST_SECS);
    for (const offset of [1, 2, 3, 4, 5]) {
      expect(byDate.get(dateKey(offset))).toBe(TTL_FUTURE_SECS);
    }
    // Today is the foreground refresh's job, not this one's.
    expect(byDate.has(dateKey(0))).toBe(false);
  });

  it('continues past a day that fails and never rejects', async () => {
    const day = jest
      .spyOn(db, 'getFixturesForDate')
      .mockRejectedValueOnce(new Error('provider down'));

    await expect(warmAdjacentDays()).resolves.toBeUndefined();

    expect(day).toHaveBeenCalledTimes(6);
  });
});
