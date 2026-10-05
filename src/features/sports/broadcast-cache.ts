import { subscribeToCatalogueRefreshes } from '@/stores/playlist/catalogue-events';
import type { RankedBroadcast } from 'expo-m3u-parser';

import { bumpSportsCacheEpoch } from './sports-cache-epoch';

/**
 * The channels matched to a fixture, remembered for the length of a browsing
 * session.
 *
 * Matching is the most expensive thing the match surface does: the native side
 * scans the playlist while holding the channel database lock, so reopening the
 * same match — which the user does constantly, flicking between the surface and
 * the list — must not pay for it twice. The playlist and country are part of
 * the key, so switching either resolves to a miss rather than a stale answer;
 * {@link clearBroadcastCache} covers the case where the data underneath a key
 * is refreshed in place.
 */

/** How long a matched channel list stays good enough to reuse. */
const TTL_MS = 5 * 60_000;

interface CacheEntry {
  results: RankedBroadcast[];
  at: number;
}

const entries = new Map<string, CacheEntry>();

export function broadcastCacheKey(
  playlistId: string,
  fixtureProviderId: number,
  country: string
): string {
  return `${playlistId}|${fixtureProviderId}|${country}`;
}

/** The cached match for `key`, or `null` when there is none or it has expired. */
export function readBroadcastCache(key: string, now: number = Date.now()): RankedBroadcast[] | null {
  const entry = entries.get(key);
  if (!entry) return null;
  if (now - entry.at >= TTL_MS) {
    entries.delete(key);
    return null;
  }
  return entry.results;
}

export function writeBroadcastCache(
  key: string,
  results: RankedBroadcast[],
  now: number = Date.now()
): void {
  entries.set(key, { results, at: now });
}

/**
 * Drop every cached match. Called wherever the broadcast data behind them is
 * refreshed (see `invalidateSportsCaches`) and, through the subscription below,
 * after every playlist import or guide download — the key alone cannot tell
 * that the same playlist now holds different channels or programmes.
 */
export function clearBroadcastCache(): void {
  entries.clear();
}

/**
 * A refreshed catalogue changes the answer to every match: panels rename their
 * event channels per fixture, and the guide is what ties a channel to a
 * kickoff. Subscribed at module scope because the cache is module scope — it
 * outlives every match surface, and a process that never loaded this module
 * has no matches cached to drop.
 *
 * The epoch bump is what reaches the surfaces already open: their channels sit
 * in query state rather than in this cache, and an invalidation reloads them
 * silently, keeping the rows on screen until the new match lands.
 */
subscribeToCatalogueRefreshes(() => {
  clearBroadcastCache();
  bumpSportsCacheEpoch();
});
