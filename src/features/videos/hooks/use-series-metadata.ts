import { useEffect, useRef, useState } from 'react';
import { RustChannelService } from '@/services/rust-channel-service';
import type { ChannelMetadata } from 'expo-m3u-parser';

interface UseSeriesMetadataReturn {
  metadata: ChannelMetadata | null;
  isLoading: boolean;
}

/**
 * Hook to fetch rich metadata for a series by its name.
 * Only fetches when visible is true and playlistId/seriesName are provided.
 */
export function useSeriesMetadata(
  playlistId: string | null | undefined,
  seriesName: string | null | undefined,
  visible: boolean
): UseSeriesMetadataReturn {
  const [metadata, setMetadata] = useState<ChannelMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Clear the previous series' metadata before resolving the new one so stale
    // details can't show through while the next fetch is in flight.
    setMetadata(null);

    if (!visible || !playlistId || !seriesName) {
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    RustChannelService.getMetadataBySeriesName(playlistId, seriesName)
      .then((result) => {
        if (!cancelled && isMountedRef.current) {
          setMetadata(result);
        }
      })
      .catch((err) => {
        if (!cancelled && isMountedRef.current) {
          const message =
            err instanceof Error ? err.message : 'Failed to fetch metadata';
          console.error('[useSeriesMetadata] Error:', message);
          setMetadata(null);
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
  }, [visible, playlistId, seriesName]);

  return { metadata, isLoading };
}
