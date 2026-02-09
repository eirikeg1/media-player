import { useState, useEffect, useRef } from 'react';
import { RustChannelService } from '@/services/rust-channel-service';
import type { Channel } from '@/types/playlist.types';

interface UseSeriesEpisodesReturn {
  episodes: Channel[];
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook to fetch all episodes for a given series.
 * Simple useEffect-based fetch (no pagination needed).
 */
export function useSeriesEpisodes(
  playlistId: string | null | undefined,
  seriesName: string | null | undefined,
  groupName: string | null | undefined
): UseSeriesEpisodesReturn {
  const [episodes, setEpisodes] = useState<Channel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!playlistId || !seriesName || !groupName) {
      setEpisodes([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    RustChannelService.getSeriesEpisodes(playlistId, seriesName, groupName)
      .then((result) => {
        if (!cancelled && isMountedRef.current) {
          setEpisodes(result);
        }
      })
      .catch((err) => {
        if (!cancelled && isMountedRef.current) {
          const message = err instanceof Error ? err.message : 'Failed to fetch episodes';
          console.error('[useSeriesEpisodes] Error:', message);
          setError(message);
          setEpisodes([]);
        }
      })
      .finally(() => {
        if (!cancelled && isMountedRef.current) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [playlistId, seriesName, groupName]);

  return { episodes, isLoading, error };
}
