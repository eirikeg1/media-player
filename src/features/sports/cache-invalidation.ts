import type { SportsDatabase } from 'expo-m3u-parser';

/**
 * Mark everything the native side derives from a fixture fetch as stale: the
 * per-match detail sections, standings and scorers, the cached day schedules
 * and the per-fixture broadcast lists.
 *
 * Called wherever the data behind those sections is being refreshed — the pull
 * to refresh, the "Refresh now" button and the background task — so a refresh
 * means the whole screen, not just the scoreline. The fixture rows themselves
 * keep their fetch stamps: the refresh that follows re-reads them with its own
 * TTL, and dropping them would repeat that day fan-out for nothing.
 *
 * Never throws: failing to invalidate only means the next read is served from
 * cache a while longer, which must not fail the refresh around it.
 */
export async function invalidateSportsCaches(db: SportsDatabase): Promise<void> {
  try {
    await db.invalidateSportsCaches();
  } catch (err) {
    console.warn('[sports] Cache invalidation failed:', err);
  }
}
