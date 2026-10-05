import { getSportsDatabase } from '@/services/sports-service';
import { __resetM3uFake } from '@/test/fakes/m3u-database-fake';
import {
  DEFAULT_USER_SETTINGS,
  type SportsBackgroundRefresh,
  type User,
} from '@/types/user.types';
import type { FixtureWindow, SportsDatabase } from 'expo-m3u-parser';

import {
  __resetLandingReadiness,
  reportLandingReady,
  whenLandingReady,
} from '@/features/launch/landing-readiness';

import {
  __resetSportsLaunchState,
  getSportsWarmPromise,
  startSportsLaunchWarm,
  waitForSportsWarm,
} from '../background/foreground-refresh';

/** Mirrors `WARM_READINESS_TIMEOUT_MS` in the module, which is private. */
const WARM_READINESS_TIMEOUT_MS = 4_000;
/** Mirrors `DAY_VIEW_SETTLE_TIMEOUT_MS` in `use-background-refresh`. */
const DAY_VIEW_SETTLE_TIMEOUT_MS = 10_000;

function user(
  overrides: { showSportsTab?: boolean; sportsBackgroundRefresh?: SportsBackgroundRefresh } = {}
): User {
  return {
    id: 'u1',
    username: 'Eirik',
    createdAt: new Date(0),
    updatedAt: new Date(0),
    settings: { ...DEFAULT_USER_SETTINGS, userId: 'u1', ...overrides },
  };
}

let db: SportsDatabase;

beforeEach(async () => {
  jest.useFakeTimers();
  __resetM3uFake();
  __resetSportsLaunchState();
  __resetLandingReadiness();
  db = await getSportsDatabase();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('startSportsLaunchWarm', () => {
  it("warms today's schedule for a user whose sports tab is on, once per launch", async () => {
    const day = jest.spyOn(db, 'getFixturesForWindow');

    startSportsLaunchWarm(user());
    const warm = getSportsWarmPromise();
    expect(warm).not.toBeNull();
    await warm;

    expect(day).toHaveBeenCalledTimes(1);

    // A second launch warm would double a cold launch's request budget.
    startSportsLaunchWarm(user());
    expect(getSportsWarmPromise()).toBe(warm);
    expect(day).toHaveBeenCalledTimes(1);
  });

  it('spends nothing for a user who hid the sports tab', () => {
    const day = jest.spyOn(db, 'getFixturesForWindow');

    startSportsLaunchWarm(user({ showSportsTab: false }));

    expect(getSportsWarmPromise()).toBeNull();
    expect(day).not.toHaveBeenCalled();
  });

  it('honours "refresh when opening", which a launch is the first of', () => {
    const day = jest.spyOn(db, 'getFixturesForWindow');

    startSportsLaunchWarm(
      user({
        sportsBackgroundRefresh: {
          mode: 'off',
          intervalHours: 4,
          dailyTime: '07:00',
          refreshOnOpen: false,
        },
      })
    );

    expect(getSportsWarmPromise()).toBeNull();
    expect(day).not.toHaveBeenCalled();
  });

  it('leaves no unhandled rejection when the warm fails and nothing joins it', async () => {
    jest.spyOn(db, 'getFixturesForWindow').mockRejectedValue(new Error('provider down'));

    startSportsLaunchWarm(user());

    // The failure is still there for whoever does join.
    await expect(getSportsWarmPromise()).rejects.toThrow('provider down');
  });
});

describe('waitForSportsWarm', () => {
  it('returns at once when no warm was started', async () => {
    await expect(waitForSportsWarm()).resolves.toBeUndefined();
  });

  it('waits for the warm rather than revealing the UI over a skeleton', async () => {
    let release!: (window: FixtureWindow) => void;
    jest
      .spyOn(db, 'getFixturesForWindow')
      .mockReturnValue(new Promise<FixtureWindow>((resolve) => (release = resolve)));

    startSportsLaunchWarm(user());
    let ready = false;
    const waiting = waitForSportsWarm().then(() => {
      ready = true;
    });

    await jest.advanceTimersByTimeAsync(WARM_READINESS_TIMEOUT_MS - 1_000);
    expect(ready).toBe(false);

    release({ fixtures: [], stale: false });
    await waiting;
    expect(ready).toBe(true);
  });

  it('gives up on a provider that is down rather than holding the splash', async () => {
    let release!: (window: FixtureWindow) => void;
    jest
      .spyOn(db, 'getFixturesForWindow')
      .mockReturnValue(new Promise<FixtureWindow>((resolve) => (release = resolve)));

    startSportsLaunchWarm(user());
    const waiting = waitForSportsWarm();

    await jest.advanceTimersByTimeAsync(WARM_READINESS_TIMEOUT_MS);
    await expect(waiting).resolves.toBeUndefined();

    // The warm itself is still going; readiness simply stopped waiting on it.
    expect(getSportsWarmPromise()).not.toBeNull();
    release({ fixtures: [], stale: false });
    await getSportsWarmPromise();
  });

  it('never rejects, so a failed warm cannot keep the UI hidden', async () => {
    jest.spyOn(db, 'getFixturesForWindow').mockRejectedValue(new Error('provider down'));

    startSportsLaunchWarm(user());

    await expect(waitForSportsWarm()).resolves.toBeUndefined();
  });
});

describe('waiting for the sports day view', () => {
  it('waits for the day view, which the warms share a request pacer with', async () => {
    let settled = false;
    const waiting = whenLandingReady('sports', DAY_VIEW_SETTLE_TIMEOUT_MS).then(() => {
      settled = true;
    });

    await jest.advanceTimersByTimeAsync(DAY_VIEW_SETTLE_TIMEOUT_MS - 1_000);
    expect(settled).toBe(false);

    reportLandingReady('sports');
    await waiting;
    expect(settled).toBe(true);
  });

  it('goes ahead anyway for a launch that never opens the sports tab', async () => {
    const waiting = whenLandingReady('sports', DAY_VIEW_SETTLE_TIMEOUT_MS);

    await jest.advanceTimersByTimeAsync(DAY_VIEW_SETTLE_TIMEOUT_MS);

    await expect(waiting).resolves.toBeUndefined();
  });
});
