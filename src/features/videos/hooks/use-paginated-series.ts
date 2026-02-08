import { useState, useEffect, useCallback, useRef } from 'react';
import { RustChannelService } from '@/services/rust-channel-service';
import type { SeriesInfo } from 'expo-m3u-parser';

const DEFAULT_PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

interface UsePaginatedSeriesOptions {
  playlistId: string | null | undefined;
  groups?: string[];
  search?: string;
  pageSize?: number;
  excludeAdult?: boolean;
}

interface UsePaginatedSeriesReturn {
  series: SeriesInfo[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  loadMore: () => void;
  refresh: () => void;
  totalCount: number;
}

/**
 * Hook for paginated series loading with server-side filtering.
 * Mirrors usePaginatedChannels but calls getSeriesList.
 */
export function usePaginatedSeries({
  playlistId,
  groups,
  search,
  pageSize = DEFAULT_PAGE_SIZE,
  excludeAdult,
}: UsePaginatedSeriesOptions): UsePaginatedSeriesReturn {
  const [series, setSeries] = useState<SeriesInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);

  // Stabilize groups reference
  const groupsRef = useRef(groups);
  if (
    groups?.length !== groupsRef.current?.length ||
    groups?.some((g, i) => g !== groupsRef.current?.[i])
  ) {
    groupsRef.current = groups;
  }
  const stableGroups = groupsRef.current;

  const offsetRef = useRef(0);
  const isLoadingRef = useRef(false);
  const debouncedSearchRef = useRef<string | undefined>(search);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPage = useCallback(
    async (offset: number, isInitial: boolean) => {
      if (!playlistId) {
        setSeries([]);
        setHasMore(false);
        setTotalCount(0);
        return;
      }

      if (isLoadingRef.current) return;
      isLoadingRef.current = true;

      if (isInitial) {
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }
      setError(null);

      try {
        const result = await RustChannelService.getSeriesList(playlistId, {
          groups: stableGroups && stableGroups.length > 0 ? stableGroups : undefined,
          search: debouncedSearchRef.current || undefined,
          limit: pageSize,
          offset,
          excludeAdult,
        });

        const hasMorePages = offset + result.series.length < result.totalCount;
        setHasMore(hasMorePages);

        if (isInitial) {
          setSeries(result.series);
          setTotalCount(result.totalCount);
        } else {
          setSeries((prev) => [...prev, ...result.series]);
        }

        offsetRef.current = offset + result.series.length;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch series';
        console.error('[usePaginatedSeries] Error:', message);
        setError(message);
        if (isInitial) {
          setSeries([]);
        }
      } finally {
        isLoadingRef.current = false;
        if (isInitial) {
          setIsLoading(false);
        } else {
          setIsLoadingMore(false);
        }
      }
    },
    [playlistId, stableGroups, pageSize, excludeAdult]
  );

  // Reset and fetch first page when filters change
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const isSearchChange = search !== debouncedSearchRef.current;

    debounceTimerRef.current = setTimeout(() => {
      debouncedSearchRef.current = search;
      offsetRef.current = 0;
      setSeries([]);
      setHasMore(true);
      fetchPage(0, true);
    }, isSearchChange ? SEARCH_DEBOUNCE_MS : 0);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [playlistId, stableGroups, search, fetchPage]);

  const loadMore = useCallback(() => {
    if (!hasMore || isLoadingRef.current) return;
    fetchPage(offsetRef.current, false);
  }, [hasMore, fetchPage]);

  const refresh = useCallback(() => {
    offsetRef.current = 0;
    setSeries([]);
    setHasMore(true);
    fetchPage(0, true);
  }, [fetchPage]);

  return {
    series,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    loadMore,
    refresh,
    totalCount,
  };
}
