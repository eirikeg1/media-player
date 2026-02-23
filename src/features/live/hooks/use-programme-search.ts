import { useEffect, useRef, useState } from 'react';
import { EpgService } from '@/services/epg-service';
import type { EpgProgramme } from 'expo-m3u-parser';

const SEARCH_DEBOUNCE_MS = 300;

interface UseProgrammeSearchReturn {
  results: EpgProgramme[];
  totalCount: number;
  isSearching: boolean;
}

/**
 * Debounced programme search wrapper around EpgService.searchProgrammes().
 * Returns empty results when query is empty or too short.
 */
export function useProgrammeSearch(
  query: string,
  options?: {
    from?: number;
    to?: number;
    category?: string;
    limit?: number;
  }
): UseProgrammeSearchReturn {
  const [results, setResults] = useState<EpgProgramme[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const fetchGenerationRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stabilize options ref
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setTotalCount(0);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const generation = ++fetchGenerationRef.current;

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const result = await EpgService.searchProgrammes(trimmed, optionsRef.current);
        if (generation !== fetchGenerationRef.current) return;
        // Flatten grouped results into a flat array
        const flat: EpgProgramme[] = [];
        for (const group of result.groups) {
          flat.push(...group.programmes);
        }
        setResults(flat);
        setTotalCount(flat.length);
      } catch (err) {
        if (generation !== fetchGenerationRef.current) return;
        if (__DEV__) {
          console.warn('[useProgrammeSearch] Error:', err);
        }
        setResults([]);
        setTotalCount(0);
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
  }, [query]);

  return { results, totalCount, isSearching };
}
