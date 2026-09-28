/**
 * The launch warm is once per process (`warmedAdjacentDays` in the hook, the
 * warm promise in `foreground-refresh`), so this suite drives it exactly once —
 * jest gives each file its own module registry.
 */
import { getSportsDatabase } from '@/services/sports-service';
import { useUserStore } from '@/stores/user/user-store';
import { __resetM3uFake } from '@/test/fakes/m3u-database-fake';
import { DEFAULT_USER_SETTINGS, type User } from '@/types/user.types';
import { renderHook } from '@testing-library/react-native';
import type { FixtureWindow, SportsDatabase } from 'expo-m3u-parser';

import {
  __resetLandingReadiness,
  reportLandingReady,
} from '@/features/launch/landing-readiness';

import { __resetSportsLaunchState, startSportsLaunchWarm } from '../background/foreground-refresh';
import { useBackgroundRefresh } from '../background/use-background-refresh';

// The OS scheduler is the one platform-aware piece here, and registering a real
// background task says nothing about the warm under test.
jest.mock('../background/expo-scheduler', () => ({
  expoBackgroundScheduler: {
    isAvailable: jest.fn(async () => false),
    register: jest.fn(async () => undefined),
    unregister: jest.fn(async () => undefined),
  },
}));
jest.mock('../background/refresh-state-store', () => ({
  refreshStateStore: {
    getPreference: jest.fn(async () => null),
    setPreference: jest.fn(async () => undefined),
    getLastRunAt: jest.fn(async () => null),
    setLastRunAt: jest.fn(async () => undefined),
  },
}));

/** Mirrors `LAUNCH_WARM_DELAY_MS` in the hook, which is private. */
const LAUNCH_WARM_DELAY_MS = 3_000;

const USER: User = {
  id: 'u1',
  username: 'Eirik',
  createdAt: new Date(0),
  updatedAt: new Date(0),
  settings: { ...DEFAULT_USER_SETTINGS, userId: 'u1' },
};

let db: SportsDatabase;

it('joins the boot warm and holds the adjacent days back for the day view', async () => {
  jest.useFakeTimers();
  __resetM3uFake();
  __resetSportsLaunchState();
  __resetLandingReadiness();
  useUserStore.setState({ currentUser: USER });
  db = await getSportsDatabase();
  jest.spyOn(console, 'warn').mockImplementation(() => {});

  // The boot sequence has already started today's warm; hold it open so the
  // hook's launch warm has something to join.
  let releaseToday!: (window: FixtureWindow) => void;
  const day = jest
    .spyOn(db, 'getFixturesForWindow')
    .mockReturnValueOnce(new Promise<FixtureWindow>((resolve) => (releaseToday = resolve)));
  startSportsLaunchWarm(USER);
  await jest.advanceTimersByTimeAsync(0);
  expect(day).toHaveBeenCalledTimes(1);

  // The hook renders nothing and holds no state, so no act() is needed; the
  // work it starts is plain promises behind a timer.
  renderHook(() => useBackgroundRefresh());
  await jest.advanceTimersByTimeAsync(LAUNCH_WARM_DELAY_MS);

  // Joined, not repeated: a second fan-out would double the launch budget.
  expect(day).toHaveBeenCalledTimes(1);

  releaseToday({ fixtures: [], stale: false });
  await jest.advanceTimersByTimeAsync(0);

  // Today is in hand, but the day view has not had its own read yet — the
  // adjacent days share the provider's pacer with it and must wait.
  expect(day).toHaveBeenCalledTimes(1);

  reportLandingReady('sports');
  await jest.advanceTimersByTimeAsync(0);

  // Tomorrow and yesterday, and nothing more.
  expect(day).toHaveBeenCalledTimes(3);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});
