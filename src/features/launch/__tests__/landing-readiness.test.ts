/**
 * The one "the screen the launch landed on is populated" signal: what releases
 * the loading screen, and what it does when nothing ever reports.
 */
import {
  LANDING_READY_TIMEOUT_MS,
  __resetLandingReadiness,
  reportLandingReady,
  whenLandingReady,
} from '@/features/launch/landing-readiness';

beforeEach(() => {
  jest.useFakeTimers();
  __resetLandingReadiness();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('whenLandingReady', () => {
  it('resolves as soon as the screen reports its first load', async () => {
    let ready = false;
    const waiting = whenLandingReady('home').then(() => {
      ready = true;
    });

    await jest.advanceTimersByTimeAsync(10);
    expect(ready).toBe(false);

    reportLandingReady('home');

    await waiting;
    expect(ready).toBe(true);
  });

  it('resolves for a screen that reported before anyone waited', async () => {
    // The pre-fetched first page can land before the tab group has mounted.
    reportLandingReady('live');

    await expect(whenLandingReady('live')).resolves.toBeUndefined();
  });

  it('gives up on a screen that never reports, so the splash cannot pin the UI', async () => {
    let ready = false;
    const waiting = whenLandingReady('sports').then(() => {
      ready = true;
    });

    await jest.advanceTimersByTimeAsync(LANDING_READY_TIMEOUT_MS - 1);
    expect(ready).toBe(false);

    await jest.advanceTimersByTimeAsync(1);
    await waiting;
    expect(ready).toBe(true);
  });

  it('honours a caller that can wait longer than the loading screen', async () => {
    // The sports background warms use the same signal with a deadline of their
    // own; the default cap must not cut their wait short.
    let ready = false;
    const waiting = whenLandingReady('sports', LANDING_READY_TIMEOUT_MS * 2).then(() => {
      ready = true;
    });

    await jest.advanceTimersByTimeAsync(LANDING_READY_TIMEOUT_MS);
    expect(ready).toBe(false);

    await jest.advanceTimersByTimeAsync(LANDING_READY_TIMEOUT_MS);
    await waiting;
    expect(ready).toBe(true);
  });

  it('is ready on arrival for a tab with no first load of its own', async () => {
    // Settings renders from state that is already in memory: waiting for a
    // report that is never coming would cost the whole cap.
    await expect(whenLandingReady('settings')).resolves.toBeUndefined();
  });

  it('treats a second report as a no-op', async () => {
    reportLandingReady('videos');
    reportLandingReady('videos');

    // Still exactly one settled signal — the later report neither re-arms the
    // wait nor leaves a second latch behind.
    await expect(whenLandingReady('videos')).resolves.toBeUndefined();
    await expect(whenLandingReady('videos')).resolves.toBeUndefined();
  });
});
