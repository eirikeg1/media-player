import { useEffect, useRef, useState } from 'react';
import { RustChannelService } from '@/services/rust-channel-service';
import type { ChannelMetadata } from 'expo-m3u-parser';

interface UseMovieMetadataReturn {
  metadata: ChannelMetadata | null;
  isLoading: boolean;
}

/**
 * Extract Xtream stream ID from a movie URL.
 * Pattern: http://host:port/movie/user/pass/12345.ext → 12345
 * Returns null for non-Xtream URLs.
 */
function extractStreamId(url: string): number | null {
  const match = url.match(/\/movie\/[^/]+\/[^/]+\/(\d+)(?:\.\w+)?$/);
  if (!match) return null;
  return parseInt(match[1], 10);
}

/**
 * Hook to fetch rich metadata for a movie channel by its Xtream stream ID.
 * Only fetches when visible is true and a valid stream ID can be extracted.
 */
export function useMovieMetadata(
  playlistId: string | null | undefined,
  movieUrl: string | null | undefined,
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
    if (!visible || !playlistId || !movieUrl) {
      setMetadata(null);
      return;
    }

    const streamId = extractStreamId(movieUrl);
    if (streamId === null) {
      setMetadata(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    RustChannelService.getMetadataByStreamId(playlistId, streamId)
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
  }, [visible, playlistId, movieUrl]);

  return { metadata, isLoading };
}
