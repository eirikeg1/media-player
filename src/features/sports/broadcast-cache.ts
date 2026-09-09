import type { RankedBroadcast } from 'expo-m3u-parser';

/**
 * The channels matched to a fixture, remembered for the length of a browsing
 * session.
 *
 * Matching is the most expensive thing a match sheet does: the native side
 * scans the playlist while holding the channel database lock, so reopening the
 * same match — which the user does constantly, flicking between the sheet and
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
 * Drop every cached match. Called wherever the channels or the broadcast data
 * behind them are refreshed — a pull-to-refresh, a playlist import — since the
 * key alone cannot tell that the same playlist now holds different channels.
 */
export function clearBroadcastCache(): void {
  entries.clear();
}
