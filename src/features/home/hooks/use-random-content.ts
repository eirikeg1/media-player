import { getChannelId } from '@/lib/channel-utils';
import { RustChannelService } from '@/services/rust-channel-service';
import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import { useUserStore } from '@/stores/user/user-store';
import type { Channel } from '@/types/playlist.types';
import type { SeriesInfo } from 'expo-m3u-parser';
import { useCallback, useEffect, useState } from 'react';

export function useRandomContent(limit = 50) {
  const activePlaylistId = usePlaylistStore((s) => s.activePlaylistId);
  const excludeAdult = useUserStore((s) => s.currentUser?.settings?.parentalControlEnabled ?? false);

  const [movies, setMovies] = useState<Channel[]>([]);
  const [series, setSeries] = useState<SeriesInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!activePlaylistId) {
      setMovies([]);
      setSeries([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);

      const [movieResult, seriesResult] = await Promise.all([
        RustChannelService.getChannelsFilteredWithCount(activePlaylistId, {
          contentType: 'movie',
          limit,
          offset: 0,
          excludeAdult,
          sortBy: 'random',
        }),
        RustChannelService.getSeriesList(activePlaylistId, {
          limit,
          offset: 0,
          excludeAdult,
          random: true,
        }),
      ]);

      // Set series immediately — no HEAD validation needed
      const uniqueSeries = seriesResult.series
        .filter((s) => !!s.poster)
        .filter((s, i, arr) => arr.findIndex((x) => x.seriesName === s.seriesName) === i);
      setSeries(uniqueSeries);

      // Filter movies that have a logo URL
      const moviesWithLogo = movieResult.channels.filter((c) => !!c.tvg?.logo);

      // Validate image URLs actually return a valid response
      const validatedMovies = await Promise.all(
        moviesWithLogo.map(async (channel) => {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            const res = await globalThis.fetch(channel.tvg!.logo!, {
              method: 'HEAD',
              signal: controller.signal,
            });
            clearTimeout(timeout);
            return res.ok ? channel : null;
          } catch {
            return null;
          }
        })
      );

      const uniqueMovies = validatedMovies
        .filter((c): c is Channel => c !== null)
        .filter((c, i, arr) => arr.findIndex((x) => getChannelId(x) === getChannelId(c)) === i);
      setMovies(uniqueMovies);
    } catch (error) {
      console.error('[useRandomContent] Error:', error);
      setMovies([]);
      setSeries([]);
    } finally {
      setIsLoading(false);
    }
  }, [activePlaylistId, limit, excludeAdult]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { movies, series, isLoading, refresh: fetch };
}
