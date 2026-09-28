import { getSportsDatabase } from '@/services/sports-service';
import { __resetM3uFake } from '@/test/fakes/m3u-database-fake';
import type { FixtureWindow, SportsDatabase, Team } from 'expo-m3u-parser';

import { runForegroundRefresh, warmAdjacentDays } from '../background/foreground-refresh';
import { addDays, dayWindow } from '../date-utils';
import { TTL_FAVORITES_SECS, TTL_FUTURE_SECS, TTL_PAST_SECS, TTL_TODAY_SECS } from '../fixture-fetch';

const ARSENAL: Team = {
  providerId: 42,
  provider: 'sofascore',
  name: 'Arsenal',
  shortName: 'Arsenal',
  tla: 'ARS',
};

/** A window answer with nothing in it, for the reads whose rows don't matter. */
const EMPTY_WINDOW: FixtureWindow = { fixtures: [], stale: false };

/** Index of the `maxAgeSecs` argument in each of the two fetches under test. */
const TEAMS_TTL_ARG = 5;
const DAY_TTL_ARG = 2;

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
    const day = jest.spyOn(db, 'getFixturesForWindow');

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
    const day = jest.spyOn(db, 'getFixturesForWindow');

    await runForegroundRefresh({ force: true });

    expect(teams.mock.calls[0][TEAMS_TTL_ARG]).toBe(0);
    expect(day.mock.calls[0][DAY_TTL_ARG]).toBe(0);
  });

  it('invalidates the derived caches before a forced refetch, and only then', async () => {
    const invalidate = jest.spyOn(db, 'invalidateSportsCaches');
    const day = jest.spyOn(db, 'getFixturesForWindow');

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
    const day = jest.spyOn(db, 'getFixturesForWindow');

    await runForegroundRefresh();

    expect(teams).not.toHaveBeenCalled();
    expect(day).toHaveBeenCalledTimes(1);
  });

  it('still refreshes the day schedule when the favorites cannot be read', async () => {
    jest.spyOn(db, 'getFavoriteTeams').mockRejectedValue(new Error('sports db locked'));
    const day = jest.spyOn(db, 'getFixturesForWindow');

    await expect(runForegroundRefresh()).resolves.toBeUndefined();

    expect(day).toHaveBeenCalledTimes(1);
  });

  describe('joining a run already in flight', () => {
    /**
     * Start a run and hold its day schedule open, so a second caller arrives
     * while it is still fanning out. Resolving the returned `release` lets it
     * (and anything chained behind it) finish.
     */
    async function holdRun(first: { force?: boolean }) {
      const pending = deferred<FixtureWindow>();
      const day = jest.spyOn(db, 'getFixturesForWindow').mockReturnValueOnce(pending.promise);
      const running = runForegroundRefresh(first);
      await flush();
      return { day, running, release: () => pending.resolve(EMPTY_WINDOW) };
    }

    it('lets an unforced caller join an unforced run', async () => {
      const { day, running, release } = await holdRun({});

      const second = runForegroundRefresh();
      await flush();

      // Both want today's cache warm, which the run in flight is already doing.
      expect(day).toHaveBeenCalledTimes(1);
      release();
      await Promise.all([running, second]);
      expect(day).toHaveBeenCalledTimes(1);
    });

    it('lets an unforced caller join a forced run', async () => {
      const { day, running, release } = await holdRun({ force: true });

      const second = runForegroundRefresh();
      await flush();

      // A forced run gives an unforced caller strictly more than it asked for.
      expect(day).toHaveBeenCalledTimes(1);
      release();
      await Promise.all([running, second]);
      expect(day).toHaveBeenCalledTimes(1);
    });

    it('lets a forced caller join a forced run', async () => {
      const { day, running, release } = await holdRun({ force: true });

      const second = runForegroundRefresh({ force: true });
      await flush();

      expect(day).toHaveBeenCalledTimes(1);
      release();
      await Promise.all([running, second]);
      expect(day).toHaveBeenCalledTimes(1);
      expect(day.mock.calls[0][DAY_TTL_ARG]).toBe(0);
    });

    it('chains a forced caller after an unforced run', async () => {
      const { day, running, release } = await holdRun({});

      const forced = runForegroundRefresh({ force: true });
      await flush();

      // The run in flight is reading through the very caches the force is meant
      // to drop, so joining it would report a refresh that never happened.
      expect(day).toHaveBeenCalledTimes(1);
      expect(day.mock.calls[0][DAY_TTL_ARG]).toBe(TTL_TODAY_SECS);

      release();
      await Promise.all([running, forced]);

      // One fan-out at a time, and the forced one lands last, at TTL 0.
      expect(day).toHaveBeenCalledTimes(2);
      expect(day.mock.calls[1][DAY_TTL_ARG]).toBe(0);
    });

    it('still runs the chained force when the run it waited on failed', async () => {
      const day = jest
        .spyOn(db, 'getFixturesForWindow')
        .mockRejectedValueOnce(new Error('provider down'));

      const failing = runForegroundRefresh();
      const forced = runForegroundRefresh({ force: true });

      // The failure belongs to the caller that asked for that run; this one
      // still has its own work to do.
      await expect(failing).rejects.toThrow('provider down');
      await expect(forced).resolves.toBeUndefined();
      expect(day).toHaveBeenCalledTimes(2);
      expect(day.mock.calls[1][DAY_TTL_ARG]).toBe(0);
    });
  });

  it('releases the guard so a later call runs again', async () => {
    const day = jest.spyOn(db, 'getFixturesForWindow');

    await runForegroundRefresh();
    await runForegroundRefresh();

    expect(day).toHaveBeenCalledTimes(2);
  });

  it('rejects when the day schedule fails, and lets the next call retry', async () => {
    const day = jest
      .spyOn(db, 'getFixturesForWindow')
      .mockRejectedValueOnce(new Error('provider down'));

    await expect(runForegroundRefresh()).rejects.toThrow('provider down');

    await expect(runForegroundRefresh()).resolves.toBeUndefined();
    expect(day).toHaveBeenCalledTimes(2);
  });
});

describe('warmAdjacentDays', () => {
  /** Start of the local day `offset` days from now, in Unix seconds. */
  function dayStart(offset: number): number {
    return dayWindow(addDays(new Date(), offset)).fromTs;
  }

  it("warms only tomorrow and yesterday, each at the day view's own TTL", async () => {
    const day = jest.spyOn(db, 'getFixturesForWindow');

    await warmAdjacentDays();

    // Just the two days one swipe of the date strip can reach: every further
    // day is another fan-out of paced provider requests at every cold launch.
    expect(day).toHaveBeenCalledTimes(2);
    const byDay = new Map(day.mock.calls.map((call) => [call[0], call[DAY_TTL_ARG]]));
    expect([...byDay.keys()].sort()).toEqual([dayStart(-1), dayStart(1)].sort());
    expect(byDay.get(dayStart(-1))).toBe(TTL_PAST_SECS);
    expect(byDay.get(dayStart(1))).toBe(TTL_FUTURE_SECS);
    // Today is the foreground refresh's job, not this one's.
    expect(byDay.has(dayStart(0))).toBe(false);
  });

  it('continues past a day that fails and never rejects', async () => {
    const day = jest
      .spyOn(db, 'getFixturesForWindow')
      .mockRejectedValueOnce(new Error('provider down'));

    await expect(warmAdjacentDays()).resolves.toBeUndefined();

    expect(day).toHaveBeenCalledTimes(2);
  });
});
