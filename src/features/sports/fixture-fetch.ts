import type { SportsDatabase } from 'expo-m3u-parser';

import { addDays, isSameLocalDay, localDateKey, startOfLocalDay } from './date-utils';

/**
 * Cache policy shared by every fixture fetch — the day view and the background
 * refresh read the same cache, so they have to agree on how stale is too stale.
 */

/** Cache lifetimes for the worldwide schedule of one day. */
export const TTL_TODAY_SECS = 10 * 60;
export const TTL_FUTURE_SECS = 6 * 3600;
export const TTL_PAST_SECS = 24 * 3600;
/** Cache lifetime of a favorite team's own fixture list. */
export const TTL_FAVORITES_SECS = 6 * 3600;
/**
 * Read a cached dataset without ever triggering its fetch: the Rust side only
 * fetches when `now - lastFetch > maxAgeSecs`, so no finite age can expire
 * this one. A never-fetched (empty) dataset is always stale regardless.
 */
export const CACHE_ONLY_SECS = Number.MAX_SAFE_INTEGER;

/** How far around the selected day a favorite team's fixtures are fetched. */
const FAVORITES_LOOKBEHIND_DAYS = 7;
const FAVORITES_LOOKAHEAD_DAYS = 14;

/** How stale the cached schedule of `date` may be before it is refetched. */
export function cacheTtlFor(date: Date, now: Date): number {
  if (isSameLocalDay(date, now)) return TTL_TODAY_SECS;
  return date.getTime() < now.getTime() ? TTL_PAST_SECS : TTL_FUTURE_SECS;
}

export interface FavoritesWindow {
  /** Local `YYYY-MM-DD`. */
  from: string;
  to: string;
  /** Unix seconds, inclusive. */
  fromTs: number;
  toTs: number;
}

/**
 * The window a favorite team's fixtures are fetched for. It spans far more than
 * the selected day because the per-team cache is keyed by team alone: one fetch
 * has to stay useful while the user pages through neighbouring days.
 */
export function favoritesWindow(date: Date): FavoritesWindow {
  const start = startOfLocalDay(addDays(date, -FAVORITES_LOOKBEHIND_DAYS));
  const end = startOfLocalDay(addDays(date, FAVORITES_LOOKAHEAD_DAYS));
  return {
    from: localDateKey(start),
    to: localDateKey(end),
    fromTs: Math.floor(start.getTime() / 1000),
    toTs: Math.floor(end.getTime() / 1000) + 86_399,
  };
}

/**
 * Store the favorite teams' fixtures around `date` so a later day read finds
 * them in the cache. The day schedule is assembled from a fixed set of priority
 * regions, so a favorite playing outside them is only cached once its own fetch
 * ran.
 *
 * Never throws: a missing favorite must not stop the day schedule from loading.
 * Resolves `true` when the cache is up to date for `teamIds` (including the
 * empty set, which needs no request at all).
 */
export async function fetchFavoriteTeamFixtures(
  db: SportsDatabase,
  date: Date,
  teamIds: readonly number[],
  maxAgeSecs: number = TTL_FAVORITES_SECS
): Promise<boolean> {
  if (teamIds.length === 0) return true;
  const window = favoritesWindow(date);
  try {
    await db.getFixturesForTeams(
      [...teamIds],
      window.from,
      window.to,
      window.fromTs,
      window.toTs,
      maxAgeSecs
    );
    return true;
  } catch (err) {
    console.warn('[sports] Favorite team fixtures unavailable:', err);
    return false;
  }
}
