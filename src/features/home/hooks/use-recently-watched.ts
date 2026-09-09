import { stripEpisodeInfo } from '@/lib/series-utils';
import { RustChannelService } from '@/services/rust-channel-service';
import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import { useUserStore } from '@/stores/user/user-store';
import type { RecentlyWatchedItem } from '@/types/user.types';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Series posters never change while a playlist is loaded, so resolve each one
 * over the FFI at most once per session. Keyed `playlistId|seriesName`; a null
 * value records "this series has no poster" so misses aren't re-queried either.
 */
const posterCache = new Map<string, string | null>();

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

export function useRecentlyWatched(limit = 20) {
  const userId = useUserStore((s) => s.currentUser?.id);
  const activePlaylistId = usePlaylistStore((s) => s.activePlaylistId);
  const getRecentlyWatched = useUserStore((s) => s.getRecentlyWatched);
  const excludeAdult = useUserStore(
    (s) => s.currentUser?.settings?.parentalControlEnabled ?? true
  );
  const recentlyWatchedVersion = useUserStore((s) => s.recentlyWatchedVersion);

  const [items, setItems] = useState<RecentlyWatchedItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Every fetch takes the next generation; only the newest one may write state,
  // so an unmount or a superseding refresh discards the in-flight run's result.
  const generationRef = useRef(0);

  /** Supersede whatever run is in flight, so its result is discarded. */
  const cancelInFlightFetch = useCallback(() => {
    generationRef.current += 1;
  }, []);

  const fetch = useCallback(async () => {
    const generation = ++generationRef.current;
    const isCurrent = () => generationRef.current === generation;

    if (!userId || !activePlaylistId) {
      setItems([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);

      // Overfetch to have enough items after series dedup
      const rawItems = await getRecentlyWatched(userId, activePlaylistId, limit * 3);
      const filtered = rawItems.filter((item) => item.contentType !== 'live');

      // Phase 1: Look up channel data for series items to get series names
      const seriesItems = filtered.filter((item) => item.contentType === 'series');
      const channelLookups = await Promise.all(
        seriesItems.map(async (item) => {
          try {
            const channel = await RustChannelService.getChannelById(
              activePlaylistId,
              item.channelId
            );
            return { channelId: item.channelId, seriesName: channel?.tvg?.name ? stripEpisodeInfo(channel.tvg.name) : null };
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

      for (const item of filtered) {
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
          poster: await resolveSeriesPoster(activePlaylistId, name, excludeAdult),
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

      if (!isCurrent()) return;
      setItems(unique.slice(0, limit));
    } catch (error) {
      if (!isCurrent()) return;
      console.error('[useRecentlyWatched] Error:', error);
      setItems([]);
    } finally {
      if (isCurrent()) {
        setIsLoading(false);
      }
    }
  }, [userId, activePlaylistId, limit, getRecentlyWatched, excludeAdult]);

  useEffect(() => {
    fetch();
    return cancelInFlightFetch;
  }, [fetch, recentlyWatchedVersion, cancelInFlightFetch]);

  return { items, isLoading, refresh: fetch };
}
