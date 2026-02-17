import { useEffect, useRef, useState } from 'react';
import { EpgService } from '@/services/epg-service';
import type { Channel } from '@/types/playlist.types';
import type { EpgProgramme } from 'expo-m3u-parser';

const REFRESH_INTERVAL_MS = 60_000;

interface UseCurrentProgrammesReturn {
  programmes: Map<string, EpgProgramme>;
  isLoading: boolean;
}

/**
 * Bulk-fetches currently airing programmes for visible channels.
 * Only channels with tvg.id can match EPG data.
 * Refreshes every 60 seconds to keep "now playing" info current.
 */
export function useCurrentProgrammes(channels: Channel[]): UseCurrentProgrammesReturn {
  const [programmes, setProgrammes] = useState<Map<string, EpgProgramme>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const isMountedRef = useRef(true);

  // Extract and stabilize channel IDs — only channels with tvg.id can match EPG
  const channelIdsRef = useRef<string[]>([]);
  const currentIds = channels
    .map((c) => c.tvg?.id)
    .filter((id): id is string => !!id && id.trim().length > 0);

  if (
    currentIds.length !== channelIdsRef.current.length ||
    currentIds.some((id, i) => id !== channelIdsRef.current[i])
  ) {
    channelIdsRef.current = currentIds;
  }
  const stableChannelIds = channelIdsRef.current;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (stableChannelIds.length === 0) {
      setProgrammes(new Map());
      return;
    }

    let cancelled = false;

    const fetchProgrammes = async () => {
      try {
        setIsLoading(true);
        const fetchStart = Date.now();
        if (__DEV__) {
          console.log(
            `[useCurrentProgrammes] Fetching for ${stableChannelIds.length} channel(s)`
          );
        }
        const result = await EpgService.getCurrentProgrammesForChannels(stableChannelIds);
        if (__DEV__) {
          console.log(
            `[useCurrentProgrammes] Got ${result.size} programme(s) (${Date.now() - fetchStart}ms)`
          );
        }
        if (!cancelled && isMountedRef.current) {
          setProgrammes(result);
        }
      } catch (err) {
        if (__DEV__) {
          console.warn('[useCurrentProgrammes] Error:', err);
        }
      } finally {
        if (!cancelled && isMountedRef.current) {
          setIsLoading(false);
        }
      }
    };

    fetchProgrammes();

    const interval = setInterval(fetchProgrammes, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [stableChannelIds]);

  return { programmes, isLoading };
}
