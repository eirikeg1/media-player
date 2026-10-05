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
 *
 * It ends by pruning fixtures that are long past, which is the only thing that
 * bounds the sports database (see {@link pruneOldSportsData}).
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
    // The caches were dropped above, so this day has no stamp left and the
    // fan-out runs here rather than behind the answer — the wake has to have
    // the schedule before it reports itself done.
    const { fixtures } = await db.getFixturesForWindow(window.fromTs, window.toTs, TTL_TODAY_SECS);

    if (fixtures.some(isMatchLive)) {
      await db.refreshLiveFixtures();
    }

    await pruneOldSportsData(db, at);

    await stateStore.setLastRunAt(at.getTime());
    return 'ran';
  } catch (err) {
    console.warn('[sports-refresh] Background refresh failed:', err);
    return 'failed';
  }
}

/**
 * How far back fixtures are kept. Long enough that a user paging back through
 * the date strip still finds results, short enough that the tables the prune
 * cascades into — broadcaster lists and cached match detail — stay bounded.
 */
const RETENTION_DAYS = 30;

/**
 * Drop fixtures older than {@link RETENTION_DAYS} and everything keyed on them.
 *
 * Best-effort on purpose: housekeeping is not what the wake was scheduled for,
 * and a failed prune must not cost the run its `lastRunAt` stamp and make the
 * next wake repeat the whole fan-out.
 */
async function pruneOldSportsData(db: SportsDatabase, at: Date): Promise<void> {
  const cutoff = Math.floor(at.getTime() / 1000) - RETENTION_DAYS * 86_400;
  try {
    await db.pruneSportsData(cutoff);
  } catch (err) {
    console.warn('[sports-refresh] Prune failed:', err);
  }
}
