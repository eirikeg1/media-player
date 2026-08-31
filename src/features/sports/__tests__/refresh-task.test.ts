import { SportsDatabase, __resetM3uFake } from '@/test/fakes/m3u-database-fake';
import {
  DEFAULT_SPORTS_BACKGROUND_REFRESH,
  type SportsBackgroundRefresh,
} from '@/types/user.types';
import type { Fixture, SportsDatabase as SportsDatabaseApi } from 'expo-m3u-parser';

import type { RefreshStateStore } from '../background/ports';
import { performBackgroundRefresh, type RefreshTaskDeps } from '../background/refresh-task';

// 03:00 — inside the default night window, so a null (default) preference runs.
const NOW = new Date(2026, 5, 12, 3, 0, 0);
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

/** In-memory {@link RefreshStateStore}, with the writes exposed for assertions. */
function fakeStateStore(
  preference: SportsBackgroundRefresh | null,
  lastRunAt: number | null = null
): RefreshStateStore & { lastRunAt: number | null } {
  const store = {
    lastRunAt,
    getLastRunAt: async () => store.lastRunAt,
    setLastRunAt: async (ts: number) => {
      store.lastRunAt = ts;
    },
    getPreference: async () => preference,
    setPreference: async (pref: SportsBackgroundRefresh) => {
      preference = pref;
    },
  };
  return store;
}

let db: SportsDatabase;

function makeDeps(
  overrides: Partial<RefreshTaskDeps> & { stateStore: RefreshStateStore }
): RefreshTaskDeps {
  return {
    getSportsDatabase: async () => db as unknown as SportsDatabaseApi,
    getFavoriteTeamIds: async () => [ARSENAL],
    now: () => NOW,
    ...overrides,
  };
}

beforeEach(async () => {
  __resetM3uFake();
  db = await SportsDatabase.open('sports-refresh-test');
  db.__fixtures = [fixture()];
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('performBackgroundRefresh', () => {
  it('skips without touching the database when the policy says no', async () => {
    const open = jest.fn(async () => db as unknown as SportsDatabaseApi);
    const stateStore = fakeStateStore({ ...DEFAULT_SPORTS_BACKGROUND_REFRESH, mode: 'off' });

    const outcome = await performBackgroundRefresh(makeDeps({ stateStore, getSportsDatabase: open }));

    expect(outcome).toBe('skipped');
    expect(open).not.toHaveBeenCalled();
    expect(stateStore.lastRunAt).toBeNull();
  });

  it('skips when the interval has not elapsed since the last run', async () => {
    const stateStore = fakeStateStore(
      { ...DEFAULT_SPORTS_BACKGROUND_REFRESH, mode: 'interval', intervalHours: 4 },
      NOW.getTime() - 60_000
    );

    expect(await performBackgroundRefresh(makeDeps({ stateStore }))).toBe('skipped');
    expect(stateStore.lastRunAt).toBe(NOW.getTime() - 60_000);
  });

  it('falls back to the default preference when nothing is stored', async () => {
    const stateStore = fakeStateStore(null);

    // The default mode is 'interval' and it has never run, so it is due.
    expect(await performBackgroundRefresh(makeDeps({ stateStore }))).toBe('ran');
  });

  it('fetches the favorite teams before reading the day schedule', async () => {
    const teams = jest.spyOn(db, 'getFixturesForTeams');
    const day = jest.spyOn(db, 'getFixturesForDate');
    const stateStore = fakeStateStore(null);

    const outcome = await performBackgroundRefresh(makeDeps({ stateStore }));

    expect(outcome).toBe('ran');
    expect(teams).toHaveBeenCalledTimes(1);
    expect(teams.mock.calls[0][0]).toEqual([ARSENAL]);
    expect(day).toHaveBeenCalledTimes(1);
    expect(teams.mock.invocationCallOrder[0]).toBeLessThan(day.mock.invocationCallOrder[0]);
    expect(stateStore.lastRunAt).toBe(NOW.getTime());
  });

  it('skips the team fetch when there are no favorites', async () => {
    const teams = jest.spyOn(db, 'getFixturesForTeams');

    const outcome = await performBackgroundRefresh(
      makeDeps({ stateStore: fakeStateStore(null), getFavoriteTeamIds: async () => [] })
    );

    expect(outcome).toBe('ran');
    expect(teams).not.toHaveBeenCalled();
  });

  it('still runs when the favorite team fetch fails', async () => {
    jest.spyOn(db, 'getFixturesForTeams').mockRejectedValue(new Error('provider down'));
    const stateStore = fakeStateStore(null);

    expect(await performBackgroundRefresh(makeDeps({ stateStore }))).toBe('ran');
    expect(stateStore.lastRunAt).toBe(NOW.getTime());
  });

  it('still runs when the favorite team list cannot be read', async () => {
    const stateStore = fakeStateStore(null);

    const outcome = await performBackgroundRefresh(
      makeDeps({
        stateStore,
        getFavoriteTeamIds: async () => {
          throw new Error('sports db locked');
        },
      })
    );

    expect(outcome).toBe('ran');
    expect(stateStore.lastRunAt).toBe(NOW.getTime());
  });

  it('refreshes live scores only when a fixture is in play', async () => {
    const live = jest.spyOn(db, 'refreshLiveFixtures');

    expect(await performBackgroundRefresh(makeDeps({ stateStore: fakeStateStore(null) }))).toBe(
      'ran'
    );
    expect(live).not.toHaveBeenCalled();

    db.__fixtures = [fixture({ status: 'in_progress' })];
    expect(await performBackgroundRefresh(makeDeps({ stateStore: fakeStateStore(null) }))).toBe(
      'ran'
    );
    expect(live).toHaveBeenCalledTimes(1);
  });

  it('invalidates the derived caches before fetching, so the run re-stamps its own day fetch', async () => {
    const invalidate = jest.spyOn(db, 'invalidateSportsCaches');
    const day = jest.spyOn(db, 'getFixturesForDate');

    expect(await performBackgroundRefresh(makeDeps({ stateStore: fakeStateStore(null) }))).toBe(
      'ran'
    );

    expect(invalidate).toHaveBeenCalledTimes(1);
    // Invalidating after the day fetch would zero the stamp that fetch just
    // wrote and repeat the day fan-out on the next foreground open.
    expect(invalidate.mock.invocationCallOrder[0]).toBeLessThan(day.mock.invocationCallOrder[0]);
  });

  it('leaves the caches alone when the run is skipped', async () => {
    const invalidate = jest.spyOn(db, 'invalidateSportsCaches');

    const off = fakeStateStore({ ...DEFAULT_SPORTS_BACKGROUND_REFRESH, mode: 'off' });
    expect(await performBackgroundRefresh(makeDeps({ stateStore: off }))).toBe('skipped');

    expect(invalidate).not.toHaveBeenCalled();
  });

  it('fails without advancing the last run when the day schedule throws', async () => {
    jest.spyOn(db, 'getFixturesForDate').mockRejectedValue(new Error('provider down'));
    const stateStore = fakeStateStore(null);

    expect(await performBackgroundRefresh(makeDeps({ stateStore }))).toBe('failed');
    expect(stateStore.lastRunAt).toBeNull();
  });

  it('fails without advancing the last run when the live refresh throws', async () => {
    db.__fixtures = [fixture({ status: 'in_progress' })];
    jest.spyOn(db, 'refreshLiveFixtures').mockRejectedValue(new Error('provider down'));
    const stateStore = fakeStateStore(null);

    expect(await performBackgroundRefresh(makeDeps({ stateStore }))).toBe('failed');
    expect(stateStore.lastRunAt).toBeNull();
  });
});
