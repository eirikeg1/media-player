import { stripEpisodeInfo } from '@/lib/series-utils';
import { RustChannelService } from '@/services/rust-channel-service';
import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import { useUserStore } from '@/stores/user/user-store';
import type { RecentlyWatchedItem } from '@/types/user.types';
import { useCallback, useEffect, useState } from 'react';

export function useRecentlyWatched(limit = 20) {
  const currentUser = useUserStore((s) => s.currentUser);
  const activePlaylistId = usePlaylistStore((s) => s.activePlaylistId);
  const getRecentlyWatched = useUserStore((s) => s.getRecentlyWatched);
  const excludeAdult = useUserStore(
    (s) => s.currentUser?.settings?.parentalControlEnabled ?? false
  );

  const [items, setItems] = useState<RecentlyWatchedItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!currentUser?.id || !activePlaylistId) {
      setItems([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);

      // Overfetch to have enough items after series dedup
      const rawItems = await getRecentlyWatched(currentUser.id, activePlaylistId, limit * 3);
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

      // Phase 2: Look up series posters for unique series names
      const uniqueSeriesNames = [...seenSeries];
      const posterLookups = await Promise.all(
        uniqueSeriesNames.map(async (name) => {
          try {
            const result = await RustChannelService.getSeriesList(activePlaylistId, {
              search: name,
              limit: 1,
              excludeAdult,
            });
            const poster = result.series[0]?.poster ?? null;
            return { name, poster };
          } catch {
            return { name, poster: null };
          }
        })
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

      setItems(enriched.slice(0, limit));
    } catch (error) {
      console.error('[useRecentlyWatched] Error:', error);
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser?.id, activePlaylistId, limit, getRecentlyWatched, excludeAdult]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { items, isLoading, refresh: fetch };
}
