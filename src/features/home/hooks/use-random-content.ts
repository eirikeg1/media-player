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

      // Fetch cached recommendations (backend generates if cache is empty)
      const [movieResults, seriesResults] = await Promise.all([
        RustChannelService.getMovieRecommendations(activePlaylistId, excludeAdult, limit),
        RustChannelService.getSeriesRecommendations(activePlaylistId, excludeAdult, limit),
      ]);

      // Deduplicate
      const uniqueMovies = movieResults.filter(
        (c, i, arr) => arr.findIndex((x) => getChannelId(x) === getChannelId(c)) === i
      );
      const uniqueSeries = seriesResults.filter(
        (s, i, arr) => arr.findIndex((x) => x.seriesName === s.seriesName) === i
      );

      setMovies(uniqueMovies);
      setSeries(uniqueSeries);

      // Fire-and-forget: regenerate cache for next launch
      RustChannelService.regenerateMovieRecommendations(activePlaylistId, excludeAdult, limit).catch(() => {});
      RustChannelService.regenerateSeriesRecommendations(activePlaylistId, excludeAdult, limit).catch(() => {});
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
