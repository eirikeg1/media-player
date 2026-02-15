import { RustChannelService } from '@/services/rust-channel-service';
import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import { useUserStore } from '@/stores/user/user-store';
import type { Channel } from '@/types/playlist.types';
import type { SeriesInfo } from 'expo-m3u-parser';
import { useCallback, useEffect, useState } from 'react';

export function useRandomContent(limit = 30) {
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

      setMovies(movieResult.channels);
      setSeries(seriesResult.series.filter((s) => !!s.poster));
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
