import { useIsFocused } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';

import { channelShiftKey, sameChannelShifts, toChannelShifts } from '@/features/live/hooks/channel-shifts';
import { useAppState } from '@/hooks/use-app-state';
import { EpgService } from '@/services/epg-service';
import type { Channel } from '@/types/playlist.types';
import type { ChannelShift, EpgProgramme } from 'expo-m3u-parser';

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
 * Only channels with a tvg.id can match EPG data, and each is asked about with
 * its `tvg-shift`, so a shifted channel's "now" is its own (see
 * `toChannelShifts`). Appending a page fetches just the new channels; the full
 * set is re-read once a minute so "now playing" stays current. Both stop while
 * the screen is blurred or the app is backgrounded.
 */
export function useCurrentProgrammes(channels: Channel[]): UseCurrentProgrammesReturn {
  const [programmes, setProgrammes] = useState<Map<string, EpgProgramme>>(new Map());
  const [isLoading, setIsLoading] = useState(false);

  const isFocused = useIsFocused();
  const appState = useAppState();
  const isActive = isFocused && appState === 'active';

  // Extract and stabilize the channels to ask about — only those with a tvg.id
  // can match EPG data, and each carries its own shift.
  const channelsRef = useRef<ChannelShift[]>([]);
  const currentChannels = toChannelShifts(channels);

  if (!sameChannelShifts(currentChannels, channelsRef.current)) {
    channelsRef.current = currentChannels;
  }
  const stableChannels = channelsRef.current;

  /** Ids already present in `programmes`, so appends only fetch the difference. */
  const fetchedIdsRef = useRef<Set<string>>(new Set());
  /** Bumped per request; only the newest one is allowed to write state. */
  const generationRef = useRef(0);

  const runFetch = useCallback(async (batch: ChannelShift[], mode: FetchMode) => {
    if (batch.length === 0) return;

    const generation = ++generationRef.current;
    const isInitial = fetchedIdsRef.current.size === 0;
    if (isInitial) setIsLoading(true);

    try {
      const result = await EpgService.getCurrentProgrammesForChannels(batch);
      if (generation !== generationRef.current) return;

      if (mode === 'replace') {
        fetchedIdsRef.current = new Set(batch.map(channelShiftKey));
        setProgrammes(result);
      } else {
        for (const channel of batch) fetchedIdsRef.current.add(channelShiftKey(channel));
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
    if (stableChannels.length > 0) return;
    generationRef.current++;
    fetchedIdsRef.current = new Set();
    setProgrammes(new Map());
    setIsLoading(false);
  }, [stableChannels]);

  // Fetch only the channels that appeared since the last fetch.
  useEffect(() => {
    if (!isActive) return;
    const newChannels = stableChannels.filter(
      (channel) => !fetchedIdsRef.current.has(channelShiftKey(channel))
    );
    if (newChannels.length === 0) return;
    void runFetch(newChannels, 'merge');
  }, [isActive, stableChannels, runFetch]);

  // Keep "now playing" current. The channel list is read from a ref so appending
  // a page doesn't restart the interval — nor trigger a full re-fetch.
  const channelsToRefreshRef = useRef(stableChannels);
  channelsToRefreshRef.current = stableChannels;

  useEffect(() => {
    if (!isActive) return;

    const refreshAll = () => void runFetch(channelsToRefreshRef.current, 'replace');
    // On the very first activation the effect above is already fetching; on a
    // later one the data is as stale as the time spent away.
    if (fetchedIdsRef.current.size > 0) refreshAll();

    const interval = setInterval(refreshAll, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isActive, runFetch]);

  return { programmes, isLoading };
}
