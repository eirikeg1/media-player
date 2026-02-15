import { useState, useEffect, useCallback, useRef } from 'react';
import { RustChannelService } from '@/services/rust-channel-service';
import { useFirstPageCacheStore } from '@/stores/cache';
import type { SeriesInfo } from 'expo-m3u-parser';

const DEFAULT_PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

interface UsePaginatedSeriesOptions {
  playlistId: string | null | undefined;
  groups?: string[];
  search?: string;
  pageSize?: number;
  excludeAdult?: boolean;
  favoriteChannelIds?: string[];
  sortOrder?: 'asc' | 'desc';
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
  favoriteChannelIds,
  sortOrder,
}: UsePaginatedSeriesOptions): UsePaginatedSeriesReturn {
  const [series, setSeries] = useState<SeriesInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [loadedPlaylistId, setLoadedPlaylistId] = useState<string | null>(null);

  // Use a ref for favorite names so toggling a favorite doesn't trigger re-fetch.
  // Extract series names from favorite IDs by stripping the "series:" prefix.
  const favoriteNamesRef = useRef<string[]>([]);
  favoriteNamesRef.current = (favoriteChannelIds ?? [])
    .filter((id) => id.startsWith('series:'))
    .map((id) => id.slice(7));

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
  // Generation counter to discard stale fetch results after filter changes
  const fetchGenerationRef = useRef(0);
  const debouncedSearchRef = useRef<string | undefined>(search);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPage = useCallback(
    async (offset: number, isInitial: boolean, showLoading: boolean = true) => {
      if (!playlistId) {
        setSeries([]);
        setHasMore(false);
        setTotalCount(0);
        return;
      }

      if (isLoadingRef.current) return;

      const generation = fetchGenerationRef.current;
      isLoadingRef.current = true;

      if (isInitial && showLoading) {
        setIsLoading(true);
      } else if (!isInitial) {
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
          favoriteNames: favoriteNamesRef.current.length > 0 ? favoriteNamesRef.current : undefined,
          sortOrder: sortOrder || undefined,
        });

        // Discard stale results from superseded fetches
        if (generation !== fetchGenerationRef.current) return;

        const hasMorePages = offset + result.series.length < result.totalCount;
        setHasMore(hasMorePages);

        if (isInitial) {
          setSeries(result.series);
          setTotalCount(result.totalCount);

          // Write back to cache for unfiltered default views (only for default sort)
          if (playlistId && !debouncedSearchRef.current && (!stableGroups || stableGroups.length === 0) && !sortOrder) {
            useFirstPageCacheStore.getState().setCachedSeries(
              playlistId, result.series, result.totalCount
            );
          }
        } else {
          setSeries((prev) => [...prev, ...result.series]);
        }

        offsetRef.current = offset + result.series.length;
      } catch (err) {
        if (generation !== fetchGenerationRef.current) return;
        const message = err instanceof Error ? err.message : 'Failed to fetch series';
        console.error('[usePaginatedSeries] Error:', message);
        setError(message);
        if (isInitial) {
          setSeries([]);
        }
      } finally {
        if (generation === fetchGenerationRef.current) {
          isLoadingRef.current = false;
          if (isInitial) {
            setLoadedPlaylistId(playlistId ?? null);
            if (showLoading) {
              setIsLoading(false);
            }
          } else {
            setIsLoadingMore(false);
          }
        }
      }
    },
    [playlistId, stableGroups, pageSize, excludeAdult, sortOrder]
  );

  // Reset and fetch first page when filters change
  useEffect(() => {
    // Don't clear data when hook is deactivated — stale data isn't rendered
    if (!playlistId) return;

    // Invalidate any in-flight fetch so its results are discarded
    fetchGenerationRef.current++;
    // Reset loading guard so new filter combinations can fetch
    isLoadingRef.current = false;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const isSearchChange = search !== debouncedSearchRef.current;

    const runFetch = () => {
      debouncedSearchRef.current = search;
      offsetRef.current = 0;

      // Check cache for unfiltered default views (only for default sort)
      const isDefaultView = !search && (!stableGroups || stableGroups.length === 0) && !sortOrder;
      if (isDefaultView) {
        const cached = useFirstPageCacheStore.getState().getCachedSeries(playlistId);
        const cachedExcludeAdult = useFirstPageCacheStore.getState().getExcludeAdult(playlistId);
        if (cached && cached.items.length > 0 && cachedExcludeAdult === excludeAdult) {
          setSeries(cached.items);
          setTotalCount(cached.totalCount);
          setHasMore(cached.items.length < cached.totalCount);
          setLoadedPlaylistId(playlistId);
          offsetRef.current = cached.items.length;
          // Background revalidation (no loading spinner)
          fetchPage(0, true, false);
          return;
        }
      }

      setSeries([]);
      setHasMore(true);
      fetchPage(0, true);
    };

    // Only debounce actual search changes — run everything else synchronously
    if (isSearchChange) {
      debounceTimerRef.current = setTimeout(runFetch, SEARCH_DEBOUNCE_MS);
    } else {
      runFetch();
    }

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [playlistId, stableGroups, search, excludeAdult, sortOrder, fetchPage]);

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

  // Consider loading if explicitly loading OR if playlistId changed but data hasn't loaded yet
  const isEffectivelyLoading = isLoading || (!!playlistId && loadedPlaylistId !== playlistId);

  return {
    series,
    isLoading: isEffectivelyLoading,
    isLoadingMore,
    hasMore,
    error,
    loadMore,
    refresh,
    totalCount,
  };
}
