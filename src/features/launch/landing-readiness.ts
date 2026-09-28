import type { TabKey } from '@/features/user/visible-tabs';
import { raceWithTimeout } from '@/lib/promise-utils';

/**
 * How long the loading screen waits for the landing screen's first data.
 *
 * The splash is allowed to ride out a first page that is still arriving, not to
 * wait on a backend that is down: past the cap the screen is revealed with
 * whatever it has (its own skeleton), which is still better than a splash that
 * swallows touches.
 */
export const LANDING_READY_TIMEOUT_MS = 4_000;

/**
 * The tabs that load data of their own before they are worth looking at, and
 * therefore report. Anything else — Settings, which renders from state that is
 * already in memory — has nothing to wait for and is ready on arrival.
 */
const REPORTING_TABS: readonly TabKey[] = ['home', 'live', 'videos', 'sports'];

/** A tab's "my first load has landed" signal, resolved at most once. */
interface ReadyLatch {
  promise: Promise<void>;
  report: () => void;
}

const latches = new Map<TabKey, ReadyLatch>();

/**
 * The latch for `tab`, created on first use.
 *
 * Created lazily from either side, so it does not matter whether the screen
 * reports before or after anyone waits: a report on a tab nobody is waiting for
 * simply leaves a resolved latch behind for the waiter that arrives next.
 */
function latchFor(tab: TabKey): ReadyLatch {
  const existing = latches.get(tab);
  if (existing) return existing;

  let report!: () => void;
  const promise = new Promise<void>((resolve) => {
    report = resolve;
  });
  const latch: ReadyLatch = { promise, report };
  latches.set(tab, latch);
  return latch;
}

/**
 * Report that `tab`'s own first load has landed and the screen is populated.
 *
 * Idempotent: every call after the first is a no-op, so a screen may report
 * from a render-driven effect without tracking whether it already has.
 */
export function reportLandingReady(tab: TabKey): void {
  latchFor(tab).report();
}

/**
 * Wait until `tab` has reported its first load, or `timeoutMs` has passed.
 *
 * This is the one "the screen is populated" mechanism: the launch sequence
 * waits on the tab it lands on before dropping the splash, and the sports
 * background warms wait on the sports day view (with a deadline of their own)
 * before spending provider requests the screen is competing for.
 */
export function whenLandingReady(
  tab: TabKey,
  timeoutMs: number = LANDING_READY_TIMEOUT_MS,
): Promise<void> {
  if (!REPORTING_TABS.includes(tab)) return Promise.resolve();
  return raceWithTimeout(latchFor(tab).promise, timeoutMs);
}

/**
 * Test-only: forget every report. Latches are module state that would otherwise
 * leak between tests, one suite's report silently satisfying the next one's wait.
 */
export function __resetLandingReadiness(): void {
  latches.clear();
}
