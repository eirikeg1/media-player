import { useCallback, useEffect, useRef, useState } from 'react';

import { EpgService } from '@/services/epg-service';
import type { Channel } from '@/types/playlist.types';
import type { EpgProgramme } from 'expo-m3u-parser';

interface UseGuideProgrammesReturn {
  programmesByChannel: Map<string, EpgProgramme[]>;
  /** True only while the whole day is (re)loading — drives the skeleton. */
  isLoading: boolean;
  /** True while any fetch is in flight, including an incremental page append. */
  isFetching: boolean;
  /** Drops everything and re-reads the selected day. */
  refresh: () => void;
}

/**
 * Bulk-fetches programmes for a set of channels within a day's time range.
 * Incrementally fetches only NEW channel IDs when `loadMore` appends channels,
 * merging results into the existing Map. On date change, clears and re-fetches all.
 */
export function useGuideProgrammes(
  channels: Channel[],
  selectedDate: Date,
  enabled: boolean = true
): UseGuideProgrammesReturn {
  const [programmesByChannel, setProgrammesByChannel] = useState<Map<string, EpgProgramme[]>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [pendingFetches, setPendingFetches] = useState(0);
  const [reloadToken, setReloadToken] = useState(0);
  const fetchGenerationRef = useRef(0);
  const fetchedIdsRef = useRef<Set<string>>(new Set());

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

  // Drop the previous day's programmes in the same render that resets the
  // fetched ids — otherwise yesterday's blocks stay on screen, drawn at today's
  // offsets, and the skeleton never gets a chance to show.
  const [renderedDateKey, setRenderedDateKey] = useState(dateKey);
  if (renderedDateKey !== dateKey) {
    setRenderedDateKey(dateKey);
    fetchedIdsRef.current = new Set();
    setProgrammesByChannel(new Map());
    setIsLoading(true);
  }

  useEffect(() => {
    if (!enabled || stableChannelIds.length === 0) {
      setProgrammesByChannel(new Map());
      setIsLoading(false);
      fetchedIdsRef.current = new Set();
      return;
    }

    // Compute which IDs are new (not yet fetched)
    const newIds = stableChannelIds.filter((id) => !fetchedIdsRef.current.has(id));
    if (newIds.length === 0) return;

    const generation = ++fetchGenerationRef.current;
    const isFullFetch = fetchedIdsRef.current.size === 0;

    const fetchProgrammes = async () => {
      if (isFullFetch) {
        setIsLoading(true);
      }
      setPendingFetches((count) => count + 1);
      try {
        // Compute day boundaries in Unix seconds
        const dayStart = new Date(selectedDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(selectedDate);
        dayEnd.setHours(23, 59, 59, 999);

        const from = Math.floor(dayStart.getTime() / 1000);
        const to = Math.floor(dayEnd.getTime() / 1000);

        const result = await EpgService.getProgrammesForChannels(
          newIds,
          from,
          to
        );

        if (generation !== fetchGenerationRef.current) return;

        // Mark these IDs as fetched
        for (const id of newIds) {
          fetchedIdsRef.current.add(id);
        }

        if (isFullFetch) {
          // First load — just set the result directly
          setProgrammesByChannel(result);
        } else {
          // Incremental load — merge new results into existing Map
          setProgrammesByChannel((prev) => {
            const merged = new Map(prev);
            for (const [channelId, programmes] of result) {
              merged.set(channelId, programmes);
            }
            return merged;
          });
        }
      } catch (err) {
        if (generation !== fetchGenerationRef.current) return;
        console.warn('[useGuideProgrammes] Failed to fetch programmes:', err);
        if (isFullFetch) {
          setProgrammesByChannel(new Map());
        }
      } finally {
        setPendingFetches((count) => count - 1);
        if (generation === fetchGenerationRef.current) {
          setIsLoading(false);
        }
      }
    };

    fetchProgrammes();
  }, [stableChannelIds, dateKey, enabled, reloadToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(() => {
    fetchGenerationRef.current++;
    fetchedIdsRef.current = new Set();
    setProgrammesByChannel(new Map());
    setIsLoading(true);
    setReloadToken((token) => token + 1);
  }, []);

  return { programmesByChannel, isLoading, isFetching: pendingFetches > 0, refresh };
}
