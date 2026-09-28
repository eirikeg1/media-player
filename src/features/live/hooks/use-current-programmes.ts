import { useIsFocused } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAppState } from '@/hooks/use-app-state';
import { EpgService } from '@/services/epg-service';
import type { Channel } from '@/types/playlist.types';
import type { EpgProgramme } from 'expo-m3u-parser';

const REFRESH_INTERVAL_MS = 60_000;

interface UseCurrentProgrammesReturn {
  programmes: Map<string, EpgProgramme>;
  isLoading: boolean;
}

/**
 * `merge` keeps what is already loaded and adds the fetched channels — used when
 * pagination appends a page. `replace` treats the result as the whole truth, so
 * programmes that have ended disappear and rows from an abandoned filter are
 * pruned — used by the periodic refresh.
 */
type FetchMode = 'merge' | 'replace';

/**
 * Bulk-fetches currently airing programmes for the loaded channels.
 *
 * Only channels with a tvg.id can match EPG data. Appending a page fetches just
 * the new ids; the full set is re-read once a minute so "now playing" stays
 * current. Both stop while the screen is blurred or the app is backgrounded.
 */
export function useCurrentProgrammes(channels: Channel[]): UseCurrentProgrammesReturn {
  const [programmes, setProgrammes] = useState<Map<string, EpgProgramme>>(new Map());
  const [isLoading, setIsLoading] = useState(false);

  const isFocused = useIsFocused();
  const appState = useAppState();
  const isActive = isFocused && appState === 'active';

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

  /** Ids already present in `programmes`, so appends only fetch the difference. */
  const fetchedIdsRef = useRef<Set<string>>(new Set());
  /** Bumped per request; only the newest one is allowed to write state. */
  const generationRef = useRef(0);

  const runFetch = useCallback(async (ids: string[], mode: FetchMode) => {
    if (ids.length === 0) return;

    const generation = ++generationRef.current;
    const isInitial = fetchedIdsRef.current.size === 0;
    if (isInitial) setIsLoading(true);

    try {
      const result = await EpgService.getCurrentProgrammesForChannels(ids);
      if (generation !== generationRef.current) return;

      if (mode === 'replace') {
        fetchedIdsRef.current = new Set(ids);
        setProgrammes(result);
      } else {
        for (const id of ids) fetchedIdsRef.current.add(id);
        setProgrammes((previous) => new Map([...previous, ...result]));
      }
    } catch (err) {
      if (generation !== generationRef.current) return;
      console.warn('[useCurrentProgrammes] Failed to fetch current programmes:', err);
    } finally {
      if (generation === generationRef.current) setIsLoading(false);
    }
  }, []);

  // Drop everything when the channel list empties (playlist cleared).
  useEffect(() => {
    if (stableChannelIds.length > 0) return;
    generationRef.current++;
    fetchedIdsRef.current = new Set();
    setProgrammes(new Map());
    setIsLoading(false);
  }, [stableChannelIds]);

  // Fetch only the channels that appeared since the last fetch.
  useEffect(() => {
    if (!isActive) return;
    const newIds = stableChannelIds.filter((id) => !fetchedIdsRef.current.has(id));
    if (newIds.length === 0) return;
    void runFetch(newIds, 'merge');
  }, [isActive, stableChannelIds, runFetch]);

  // Keep "now playing" current. The id list is read from a ref so appending a
  // page doesn't restart the interval — nor trigger a full re-fetch.
  const idsRef = useRef(stableChannelIds);
  idsRef.current = stableChannelIds;

  useEffect(() => {
    if (!isActive) return;

    const refreshAll = () => void runFetch(idsRef.current, 'replace');
    // On the very first activation the effect above is already fetching; on a
    // later one the data is as stale as the time spent away.
    if (fetchedIdsRef.current.size > 0) refreshAll();

    const interval = setInterval(refreshAll, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isActive, runFetch]);

  return { programmes, isLoading };
}
