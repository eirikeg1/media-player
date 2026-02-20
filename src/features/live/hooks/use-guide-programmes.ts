import { useEffect, useRef, useState } from 'react';
import { EpgService } from '@/services/epg-service';
import type { Channel } from '@/types/playlist.types';
import type { EpgProgramme } from 'expo-m3u-parser';

interface UseGuideProgrammesReturn {
  programmesByChannel: Map<string, EpgProgramme[]>;
  isLoading: boolean;
}

/**
 * Bulk-fetches programmes for a set of channels within a day's time range.
 * Groups results by channelId and sorts by start time.
 * Uses a generation counter to discard stale results.
 */
export function useGuideProgrammes(
  channels: Channel[],
  selectedDate: Date,
  enabled: boolean = true
): UseGuideProgrammesReturn {
  const [programmesByChannel, setProgrammesByChannel] = useState<Map<string, EpgProgramme[]>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const fetchGenerationRef = useRef(0);

  // Extract and stabilize channel IDs
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

  // Stabilize date to just the day (ignore time component)
  const dateKey = `${selectedDate.getFullYear()}-${selectedDate.getMonth()}-${selectedDate.getDate()}`;

  useEffect(() => {
    if (!enabled || stableChannelIds.length === 0) {
      setProgrammesByChannel(new Map());
      return;
    }

    const generation = ++fetchGenerationRef.current;

    const fetchProgrammes = async () => {
      setIsLoading(true);
      try {
        // Compute day boundaries in Unix seconds
        const dayStart = new Date(selectedDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(selectedDate);
        dayEnd.setHours(23, 59, 59, 999);

        const from = Math.floor(dayStart.getTime() / 1000);
        const to = Math.floor(dayEnd.getTime() / 1000);

        const result = await EpgService.getProgrammesForChannels(
          stableChannelIds,
          from,
          to
        );

        if (generation !== fetchGenerationRef.current) return;

        setProgrammesByChannel(result);
      } catch (err) {
        if (generation !== fetchGenerationRef.current) return;
        if (__DEV__) {
          console.warn('[useGuideProgrammes] Error:', err);
        }
        setProgrammesByChannel(new Map());
      } finally {
        if (generation === fetchGenerationRef.current) {
          setIsLoading(false);
        }
      }
    };

    fetchProgrammes();
  }, [stableChannelIds, dateKey, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return { programmesByChannel, isLoading };
}
