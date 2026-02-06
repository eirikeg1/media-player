import { useState, useEffect } from 'react';
import { RustChannelService } from '@/services/rust-channel-service';
import type { Channel } from '@/types/playlist.types';

/**
 * Hook to fetch channels for a playlist from the Rust database
 */
export function usePlaylistChannels(playlistId: string | null | undefined) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!playlistId) {
      setChannels([]);
      return;
    }

    let cancelled = false;

    async function fetchChannels() {
      setIsLoading(true);
      setError(null);

      try {
        // playlistId is guaranteed to be non-null here due to early return above
        const result = await RustChannelService.getChannelsByPlaylistId(playlistId!);
        if (!cancelled) {
          setChannels(result);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to fetch channels';
          console.error('[usePlaylistChannels] Error:', message);
          setError(message);
          setChannels([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchChannels();

    return () => {
      cancelled = true;
    };
  }, [playlistId]);

  return { channels, isLoading, error };
}
