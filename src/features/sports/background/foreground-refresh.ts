import { getSportsDatabase } from '@/services/sports-service';

import { invalidateSportsCaches } from '../cache-invalidation';
import { dayWindow } from '../date-utils';
import { TTL_FAVORITES_SECS, TTL_TODAY_SECS, fetchFavoriteTeamFixtures } from '../fixture-fetch';

/** The run currently in flight, shared by every caller until it settles. */
let inFlight: Promise<void> | null = null;

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
 * Rejects when today's schedule cannot be loaded, so the caller can tell a real
 * refresh from a failed one. The favorites step never rejects: it is an
 * optimisation, and the day schedule is the point of the run.
 */
export async function runForegroundRefresh(opts: { force?: boolean } = {}): Promise<void> {
  // Two refreshes at once would double the fan-out for one cache; the second
  // caller joins the run already in flight instead.
  inFlight ??= run(opts.force === true).finally(() => {
    inFlight = null;
  });
  return inFlight;
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
  await db.getFixturesForDate(
    window.providerDate,
    window.fromTs,
    window.toTs,
    force ? 0 : TTL_TODAY_SECS
  );
}
