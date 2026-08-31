import { DEFAULT_SPORTS_BACKGROUND_REFRESH } from '@/types/user.types';
import type { SportsDatabase } from 'expo-m3u-parser';

import { invalidateSportsCaches } from '../cache-invalidation';
import { dayWindow } from '../date-utils';
import { TTL_TODAY_SECS, fetchFavoriteTeamFixtures } from '../fixture-fetch';
import { isMatchLive } from '../match-widgets';
import type { RefreshStateStore } from './ports';
import { shouldRunNow } from './refresh-policy';

/**
 * Everything the refresh touches, injected so the domain stays testable and
 * free of expo imports. The adapter supplies the real database, favorites and
 * clock.
 */
export interface RefreshTaskDeps {
  stateStore: RefreshStateStore;
  getSportsDatabase(): Promise<SportsDatabase>;
  getFavoriteTeamIds(db: SportsDatabase): Promise<number[]>;
  now(): Date;
}

export type RefreshOutcome = 'ran' | 'skipped' | 'failed';

/**
 * Warm today's fixture cache so the sports screen opens on fresh data.
 *
 * Runs the same three calls as the day view, in the same order and with the
 * same TTLs, because both read the one cache: favorites first so their rows are
 * stored before the day is read, then the day schedule, then a single live
 * refresh — and only when something is actually in play, since an OS wake has
 * no user watching and no reason to spend a request otherwise.
 *
 * `lastRunAt` advances only on success, so a failed wake retries at the next one.
 *
 * The run starts by invalidating the caches derived from those fixtures, so
 * the match detail the user opens afterwards describes the scores this run
 * stores rather than the ones from before the wake. Invalidating first (not
 * last) lets the run's own day fetch stamp itself fresh — zeroing that stamp
 * after the fact would repeat the day fan-out on the next foreground open.
 */
export async function performBackgroundRefresh(deps: RefreshTaskDeps): Promise<RefreshOutcome> {
  const { stateStore, getFavoriteTeamIds, now } = deps;
  try {
    const pref = (await stateStore.getPreference()) ?? DEFAULT_SPORTS_BACKGROUND_REFRESH;
    const lastRunAt = await stateStore.getLastRunAt();
    const at = now();
    if (!shouldRunNow(pref, lastRunAt, at)) return 'skipped';

    const db = await deps.getSportsDatabase();

    await invalidateSportsCaches(db);

    // Favorites are best-effort: the day schedule is the point of the run.
    let teamIds: number[] = [];
    try {
      teamIds = await getFavoriteTeamIds(db);
    } catch (err) {
      console.warn('[sports-refresh] Favorite teams unavailable:', err);
    }
    await fetchFavoriteTeamFixtures(db, at, teamIds);

    const window = dayWindow(at);
    const fixtures = await db.getFixturesForDate(
      window.providerDate,
      window.fromTs,
      window.toTs,
      TTL_TODAY_SECS
    );

    if (fixtures.some(isMatchLive)) {
      await db.refreshLiveFixtures();
    }

    await stateStore.setLastRunAt(at.getTime());
    return 'ran';
  } catch (err) {
    console.warn('[sports-refresh] Background refresh failed:', err);
    return 'failed';
  }
}
