import { userRepository } from '@/db/user-repository';
import { shareInFlight } from '@/lib/promise-utils';
import { getSeriesNameForChannel } from '@/lib/series-utils';
import { RustChannelService } from '@/services/rust-channel-service';
import type { RecentlyWatchedItem } from '@/types/user.types';

/** What one "Continue Watching" row set is built from. */
export interface RecentlyWatchedQuery {
  playlistId: string;
  userId: string;
  excludeAdult: boolean;
  /** Cards to return, after episodes of one series have collapsed into one. */
  limit: number;
  /**
   * The watch-history revision this ask is for (`recentlyWatchedVersion`). Part
   * of the identity of a run: a finished watch must start a new pass rather
   * than join one that read the history before it.
   */
  version: number;
}

/** Runs in flight, so the launch pre-fetch and the carousel mounting behind it
 *  share one pass over the history instead of making it twice. */
const inFlight = new Map<string, Promise<RecentlyWatchedItem[]>>();

/**
 * Series posters never change while a playlist is loaded, so resolve each one
 * over the FFI at most once per session. Keyed `playlistId|seriesName`; a null
 * value records "this series has no poster" so misses aren't re-queried either.
 */
const posterCache = new Map<string, string | null>();

/**
 * Drop every memoised poster. Called when the active playlist changes: a
 * re-imported playlist can hand the same series a different poster, and nothing
 * else would ever evict the entry.
 */
export function clearPosterCache(): void {
  posterCache.clear();
}

async function resolveSeriesPoster(
  playlistId: string,
  seriesName: string,
  excludeAdult: boolean
): Promise<string | null> {
  const cacheKey = `${playlistId}|${seriesName}`;
  const cached = posterCache.get(cacheKey);
  if (cached !== undefined) return cached;

  let poster: string | null = null;
  try {
    const result = await RustChannelService.getSeriesList(playlistId, {
      exactName: seriesName,
      limit: 1,
      excludeAdult,
    });
    poster = result.series[0]?.poster ?? null;
  } catch {
    // Leave the miss uncached: a transient failure shouldn't stick.
    return null;
  }

  posterCache.set(cacheKey, poster);
  return poster;
}

/**
 * The home page's "Continue Watching" cards: one per title, newest first, with
 * series episodes collapsed under their series name and poster.
 *
 * Framework-free on purpose — the launch pre-fetch fills the cache with it
 * while the loading screen is still up, and `useRecentlyWatched` serves and
 * revalidates that same cache — so the two can never answer differently.
 */
export function loadRecentlyWatched(query: RecentlyWatchedQuery): Promise<RecentlyWatchedItem[]> {
  const { playlistId, userId, excludeAdult, limit, version } = query;
  return shareInFlight(
    inFlight,
    `${playlistId}|${userId}|${excludeAdult}|${limit}|${version}`,
    () => readRecentlyWatched(query),
  );
}

async function readRecentlyWatched({
  playlistId,
  userId,
  excludeAdult,
  limit,
}: RecentlyWatchedQuery): Promise<RecentlyWatchedItem[]> {
  // Live viewing dominates the history, so it is filtered out in SQL rather
  // than by over-fetching and discarding rows here. Episodes of one series
  // *are* collapsed here though (their series name only exists after the
  // channel lookup below), so the page is deliberately wider than the row
  // count asked for — a binge of one series would otherwise leave the
  // carousel with a single card.
  const rawItems = await userRepository.getRecentlyWatched(userId, playlistId, limit * 2, {
    excludeLive: true,
  });

  // Phase 1: Look up channel data for series items to get series names
  const seriesItems = rawItems.filter((item) => item.contentType === 'series');
  const channelLookups = await Promise.all(
    seriesItems.map(async (item) => {
      try {
        const channel = await RustChannelService.getChannelById(playlistId, item.channelId);
        return {
          channelId: item.channelId,
          seriesName: channel ? getSeriesNameForChannel(channel) : null,
        };
      } catch {
        return { channelId: item.channelId, seriesName: null };
      }
    })
  );

  const seriesNameMap = new Map<string, string>();
  for (const { channelId, seriesName } of channelLookups) {
    if (seriesName) {
      seriesNameMap.set(channelId, seriesName);
    }
  }

  // Deduplicate: keep only the most recent episode per series
  const seenSeries = new Set<string>();
  const deduped: RecentlyWatchedItem[] = [];

  for (const item of rawItems) {
    if (item.contentType === 'series') {
      const seriesName = seriesNameMap.get(item.channelId);
      if (seriesName) {
        if (seenSeries.has(seriesName)) continue;
        seenSeries.add(seriesName);
        deduped.push({ ...item, seriesName });
      } else {
        // No series name found — pass through without dedup
        deduped.push(item);
      }
    } else {
      deduped.push(item);
    }
  }

  // Swap in next-episode data for completed series items
  for (let i = 0; i < deduped.length; i++) {
    const item = deduped[i];
    if (item.nextEpisodeChannelId && item.nextEpisodeChannelName) {
      deduped[i] = {
        ...item,
        channelId: item.nextEpisodeChannelId,
        channelName: item.nextEpisodeChannelName,
        lastPosition: undefined,
        totalDuration: undefined,
        nextEpisodeChannelId: undefined,
        nextEpisodeChannelName: undefined,
      };
    }
  }

  // Phase 2: Look up series posters for unique series names.
  const posterLookups = await Promise.all(
    [...seenSeries].map(async (name) => ({
      name,
      poster: await resolveSeriesPoster(playlistId, name, excludeAdult),
    }))
  );

  const posterMap = new Map<string, string>();
  for (const { name, poster } of posterLookups) {
    if (poster) {
      posterMap.set(name, poster);
    }
  }

  // Enrich series items with poster URLs
  const enriched = deduped.map((item) => {
    if (item.seriesName) {
      const poster = posterMap.get(item.seriesName);
      if (poster) {
        return { ...item, seriesPoster: poster };
      }
    }
    return item;
  });

  // Dedupe by channelId, keeping the first (most recent) occurrence. The
  // next-episode swap above can map two different items onto the same next
  // episode (e.g. a completed S01E03 and an already-present S01E04), which
  // would otherwise produce duplicate React keys in the carousel.
  const seenChannelIds = new Set<string>();
  const unique = enriched.filter((item) => {
    if (seenChannelIds.has(item.channelId)) return false;
    seenChannelIds.add(item.channelId);
    return true;
  });

  // Back down to the row count the caller asked for, now that the over-fetched
  // surplus has absorbed the collapsed duplicates.
  return unique.slice(0, limit);
}
