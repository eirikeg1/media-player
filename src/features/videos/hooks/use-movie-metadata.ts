import { useEffect, useRef, useState } from 'react';
import { RustChannelService } from '@/services/rust-channel-service';
import type { ChannelMetadata } from 'expo-m3u-parser';

interface UseMovieMetadataReturn {
  metadata: ChannelMetadata | null;
  isLoading: boolean;
}

/**
 * Hook to fetch rich metadata for a movie by its stable channel ID.
 * Looking up by channelId (the same key playback uses) keeps the info modal in sync with
 * the channel it was opened for — previously the metadata was resolved from a URL-parsed
 * stream id, which could mismatch or miss for non-standard URLs.
 * Only fetches when visible is true and a channelId is provided.
 */
export function useMovieMetadata(
  playlistId: string | null | undefined,
  channelId: string | null | undefined,
  visible: boolean
): UseMovieMetadataReturn {
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
    // Clear any previous movie's metadata before resolving the new one so a stale
    // description/poster can't show through while the next fetch is in flight.
    setMetadata(null);

    if (!visible || !playlistId || !channelId) {
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    RustChannelService.getMetadataByChannelId(playlistId, channelId)
      .then((result) => {
        if (!cancelled && isMountedRef.current) {
          setMetadata(result);
        }
      })
      .catch((err) => {
        if (!cancelled && isMountedRef.current) {
          const message =
            err instanceof Error ? err.message : 'Failed to fetch metadata';
          console.error('[useMovieMetadata] Error:', message);
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
  }, [visible, playlistId, channelId]);

  return { metadata, isLoading };
}
