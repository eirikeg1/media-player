import { useEffect, useRef, useState } from 'react';
import { EpgService } from '@/services/epg-service';
import type { Channel } from '@/types/playlist.types';
import type { EpgProgramme } from 'expo-m3u-parser';

const SEARCH_DEBOUNCE_MS = 300;

interface UseEpgSearchReturn {
  searchProgrammesByChannel: Map<string, EpgProgramme[]>;
  searchChannels: Channel[];
  isSearching: boolean;
}

/**
 * Backend-powered programme search for the EPG guide.
 * When searchText is non-empty, queries EpgService.searchProgrammes() across ALL channels
 * (not just those loaded via pagination). Groups results by channelId and resolves
 * channel metadata from loadedChannels when available.
 */
export function useEpgSearch(
  searchText: string,
  selectedDate: Date,
  selectedCategory: string | null,
  loadedChannels: Channel[]
): UseEpgSearchReturn {
  const [programmesByChannel, setProgrammesByChannel] = useState<Map<string, EpgProgramme[]>>(new Map());
  const [searchChannels, setSearchChannels] = useState<Channel[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const fetchGenerationRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep a ref to loadedChannels to avoid triggering search re-runs when channels load
  const loadedChannelsRef = useRef(loadedChannels);
  loadedChannelsRef.current = loadedChannels;

  // Stabilize category ref to avoid re-triggering on identity changes
  const categoryRef = useRef(selectedCategory);
  categoryRef.current = selectedCategory;

  // Stabilize date to just the day
  const dateKey = `${selectedDate.getFullYear()}-${selectedDate.getMonth()}-${selectedDate.getDate()}`;

  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const trimmed = searchText.trim();
    if (trimmed.length < 2) {
      setProgrammesByChannel(new Map());
      setSearchChannels([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const generation = ++fetchGenerationRef.current;

    debounceTimerRef.current = setTimeout(async () => {
      try {
        // Compute day boundaries
        const dayStart = new Date(selectedDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(selectedDate);
        dayEnd.setHours(23, 59, 59, 999);

        const from = Math.floor(dayStart.getTime() / 1000);
        const to = Math.floor(dayEnd.getTime() / 1000);

        const result = await EpgService.searchProgrammes(trimmed, {
          from,
          to,
          category: categoryRef.current ?? undefined,
          limit: 200,
        });

        if (generation !== fetchGenerationRef.current) return;

        // Backend returns pre-grouped & sorted results — convert to Map
        const grouped = new Map<string, EpgProgramme[]>();
        for (const group of result.groups) {
          grouped.set(group.channelId, group.programmes ?? []);
        }

        // Build channel list from search results
        const channelMap = new Map<string, Channel>();
        for (const ch of loadedChannelsRef.current) {
          const id = ch.tvg?.id ?? '';
          if (id) channelMap.set(id, ch);
        }

        const channels: Channel[] = [];
        for (const channelId of grouped.keys()) {
          const loaded = channelMap.get(channelId);
          if (loaded) {
            channels.push(loaded);
          } else {
            // Minimal placeholder for channels not yet loaded via pagination
            channels.push({
              name: channelId,
              url: '',
              tvg: { id: channelId },
              group: {},
            } as Channel);
          }
        }

        setProgrammesByChannel(grouped);
        setSearchChannels(channels);
      } catch (err) {
        if (generation !== fetchGenerationRef.current) return;
        if (__DEV__) {
          console.warn('[useEpgSearch] Error:', err);
        }
        setProgrammesByChannel(new Map());
        setSearchChannels([]);
      } finally {
        if (generation === fetchGenerationRef.current) {
          setIsSearching(false);
        }
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchText, dateKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return { searchProgrammesByChannel: programmesByChannel, searchChannels, isSearching };
}
