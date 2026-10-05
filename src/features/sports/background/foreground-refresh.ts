import { raceWithTimeout } from '@/lib/promise-utils';
import { getSportsDatabase } from '@/services/sports-service';
import { DEFAULT_SPORTS_BACKGROUND_REFRESH, type User } from '@/types/user.types';

import { invalidateSportsCaches } from '../cache-invalidation';
import { addDays, dayWindow } from '../date-utils';
import {
  TTL_FAVORITES_SECS,
  TTL_TODAY_SECS,
  cacheTtlFor,
  fetchFavoriteTeamFixtures,
} from '../fixture-fetch';

/** A refresh that has been started and not yet settled. */
interface RefreshRun {
  /** Whether it was asked to ignore every cache age. */
  forced: boolean;
  promise: Promise<void>;
}

/** The run currently in flight, shared by every caller it can satisfy. */
let inFlight: RefreshRun | null = null;

/**
 * The launch warm of today's schedule, started from the boot sequence while
 * the loading screen is still up. `null` until it starts, and it never starts
 * at all for a user with the sports tab hidden.
 */
let sportsWarmPromise: Promise<void> | null = null;

/** How long readiness holds the loading screen for the launch warm. */
const WARM_READINESS_TIMEOUT_MS = 4_000;

/**
 * Start the launch warm of today's schedule for `user`, from the boot sequence.
 *
 * Today's fan-out is ~10 paced requests against a host the rest of start-up
 * never touches, so it is started *with* the playlist work rather than seconds
 * after the loading screen has gone — by which time the user is already looking
 * at the sports skeleton. Once per process: {@link getSportsWarmPromise} is how
 * everything else joins it.
 *
 * Both halves of the sports preference have to allow it: a hidden tab means the
 * whole feature is off, and `refreshOnOpen` is the setting that decides whether
 * opening the app may spend provider requests at all — a launch is the first
 * open (see `use-background-refresh`).
 */
export function startSportsLaunchWarm(user: User | null): void {
  if (!wantsLaunchWarm(user) || sportsWarmPromise) return;
  sportsWarmPromise = runForegroundRefresh();
  // The promise keeps its rejection, so the launch warm can tell a real refresh
  // from a failed one — but a launch that never opens the sports tab has no
  // joiner, and must not surface as an unhandled rejection.
  sportsWarmPromise.catch(() => undefined);
}

/** Whether the launch warm is this user's to pay for. */
function wantsLaunchWarm(user: User | null): boolean {
  if (!user) return false;
  const refreshOnOpen =
    user.settings?.sportsBackgroundRefresh?.refreshOnOpen ??
    DEFAULT_SPORTS_BACKGROUND_REFRESH.refreshOnOpen;
  return (user.settings?.showSportsTab ?? true) && refreshOnOpen;
}

/** The launch warm, when one was started; `null` when the sports tab is off. */
export function getSportsWarmPromise(): Promise<void> | null {
  return sportsWarmPromise;
}

/**
 * Hold app readiness for the launch warm, but never for longer than
 * {@link WARM_READINESS_TIMEOUT_MS} — the splash is allowed to ride out a
 * schedule that is still arriving, not to wait on a provider that is down.
 *
 * Resolves at once when no warm was started, and never rejects: readiness is
 * not the place a failed refresh should be reported.
 */
export function waitForSportsWarm(): Promise<void> {
  const warm = sportsWarmPromise;
  if (!warm) return Promise.resolve();
  return raceWithTimeout(warm.catch(() => undefined), WARM_READINESS_TIMEOUT_MS);
}

/**
 * Test-only: forget the launch warm and any run still in flight —
 * once-per-process state that would otherwise leak between tests, a run left
 * unsettled by one of them silently satisfying the next one's caller.
 */
export function __resetSportsLaunchState(): void {
  inFlight = null;
  sportsWarmPromise = null;
}

/**
 * Warm today's fixture cache from the foreground — the app coming back to the
 * front, and the "Refresh now" button.
 *
 * It runs the same two calls the day view does, in the same order and against
 * the same cache: favorites first so their rows are stored before the day is
 * read, then today's schedule. Without `force` both keep their normal TTLs, so
 * a call on already-fresh data costs nothing and no separate staleness check is
 * needed; `force` drops the age to 0 for an explicit user-requested refetch,
 * and first invalidates everything derived from those fixtures — the user asked
 * for fresh data, not a fresh schedule around stale match detail.
 *
 * Only one run fans out at a time, and what a caller may join depends on what
 * it asked for. An unforced caller wants today's cache warm, which any run in
 * flight is already doing. A forced caller wants the caches dropped and refetched,
 * so it can join another forced run — but *not* an unforced one, which is
 * reading through the very caches the force is meant to replace. That case
 * chains: the forced run starts once the unforced one is out of the way.
 *
 * Rejects when today's schedule cannot be loaded, so the caller can tell a real
 * refresh from a failed one. The favorites step never rejects: it is an
 * optimisation, and the day schedule is the point of the run.
 */
export function runForegroundRefresh(opts: { force?: boolean } = {}): Promise<void> {
  const forced = opts.force === true;
  const running = inFlight;
  if (running && (!forced || running.forced)) return running.promise;

  // The earlier run's failure belongs to the caller waiting on it; this one
  // still has to do its own work, so it starts either way.
  const work = running
    ? running.promise.catch(() => undefined).then(() => run(forced))
    : run(forced);

  const entry: RefreshRun = {
    forced,
    promise: work.finally(() => {
      // Only clear the slot this run owns: a forced run chained behind it may
      // already have taken it.
      if (inFlight === entry) inFlight = null;
    }),
  };
  inFlight = entry;
  return entry.promise;
}

/**
 * Days warmed around today at boot: tomorrow first, then yesterday's results.
 *
 * Deliberately just the two the date strip can reach in one swipe. Every extra
 * day is another ~10 paced provider requests at every cold launch, all of them
 * for days the user may never open — and they compete with the fetch for the
 * day that is actually on screen.
 */
const ADJACENT_DAY_OFFSETS = [1, -1] as const;

/**
 * Warm the day schedules around today, so paging the date strip after a cold
 * launch lands on cached data.
 *
 * Runs after {@link runForegroundRefresh} has today in hand: one day at a time,
 * each read with the same TTL the day view itself would use, so a day that is
 * still fresh costs nothing and a stale one pays its fan-out here — in the
 * background — instead of under the user's finger. Never throws, and a failed
 * day doesn't stop the ones behind it: this is an optimisation only, and every
 * day view fetches for itself regardless.
 */
export async function warmAdjacentDays(): Promise<void> {
  let db;
  try {
    db = await getSportsDatabase();
  } catch (err) {
    console.warn('[sports-refresh] Sports database unavailable:', err);
    return;
  }

  const now = new Date();
  for (const offset of ADJACENT_DAY_OFFSETS) {
    const date = addDays(now, offset);
    const window = dayWindow(date);
    try {
      await db.getFixturesForWindow(window.fromTs, window.toTs, cacheTtlFor(date, now));
    } catch (err) {
      console.warn('[sports-refresh] Day warm failed:', window.key, err);
    }
  }
}

async function run(force: boolean): Promise<void> {
  const now = new Date();
  const db = await getSportsDatabase();

  if (force) await invalidateSportsCaches(db);

  // Best-effort: a favorites read that fails must not stop the day schedule.
  let teamIds: number[] = [];
  try {
    teamIds = (await db.getFavoriteTeams()).map((team) => team.providerId);
  } catch (err) {
    console.warn('[sports-refresh] Favorite teams unavailable:', err);
  }
  await fetchFavoriteTeamFixtures(db, now, teamIds, force ? 0 : TTL_FAVORITES_SECS);

  const window = dayWindow(now);
  await db.getFixturesForWindow(window.fromTs, window.toTs, force ? 0 : TTL_TODAY_SECS);
}
