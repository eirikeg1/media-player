import { useState, useEffect, useCallback, useRef } from 'react';
import { RustChannelService } from '@/services/rust-channel-service';
import { useFirstPageCacheStore } from '@/stores/cache';
import type { Channel } from '@/types/playlist.types';

const DEFAULT_PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

interface UsePaginatedChannelsOptions {
  playlistId: string | null | undefined;
  groups?: string[];
  search?: string;
  contentType?: 'live' | 'movie' | 'series';
  favoriteChannelIds: string[];
  pageSize?: number;
  excludeAdult?: boolean;
  sortBy?: 'title' | 'group' | 'tvgName';
  sortOrder?: 'asc' | 'desc';
  /** When true, use cached data without triggering a network fetch. */
  deferNetworkFetch?: boolean;
}

interface UsePaginatedChannelsReturn {
  channels: Channel[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  loadMore: () => void;
  refresh: () => void;
  totalCount: number;
}

/**
 * Hook for paginated channel loading with server-side filtering.
 * Uses the Rust backend's getChannelsFiltered API for efficient pagination.
 */
export function usePaginatedChannels({
  playlistId,
  groups,
  search,
  contentType,
  favoriteChannelIds,
  pageSize = DEFAULT_PAGE_SIZE,
  excludeAdult,
  sortBy,
  sortOrder,
  deferNetworkFetch,
}: UsePaginatedChannelsOptions): UsePaginatedChannelsReturn {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [loadedPlaylistId, setLoadedPlaylistId] = useState<string | null>(null);

  // Use a ref for favorite IDs so toggling a favorite doesn't trigger re-fetch.
  // The new sort order only takes effect on the next refresh.
  const favoriteIdsRef = useRef(favoriteChannelIds);
  favoriteIdsRef.current = favoriteChannelIds;

  // Stabilize groups reference — only update when contents actually change
  const groupsRef = useRef(groups);
  if (
    groups?.length !== groupsRef.current?.length ||
    groups?.some((g, i) => g !== groupsRef.current?.[i])
  ) {
    groupsRef.current = groups;
  }
  const stableGroups = groupsRef.current;

  // Track current offset for pagination
  const offsetRef = useRef(0);
  // Track if we're currently loading to prevent duplicate requests
  const isLoadingRef = useRef(false);
  // Generation counter to discard stale fetch results after filter changes
  const fetchGenerationRef = useRef(0);
  // Track the current search term for debouncing
  const debouncedSearchRef = useRef<string | undefined>(search);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch a page of channels
  const fetchPage = useCallback(
    async (offset: number, isInitial: boolean, showLoading: boolean = true) => {
      if (!playlistId) {
        setChannels([]);
        setHasMore(false);
        setTotalCount(0);
        return;
      }

      if (isLoadingRef.current) {
        return;
      }

      const generation = fetchGenerationRef.current;
      isLoadingRef.current = true;

      if (isInitial && showLoading) {
        setIsLoading(true);
      } else if (!isInitial) {
        setIsLoadingMore(true);
      }
      setError(null);

      try {
        const result = await RustChannelService.getChannelsFilteredWithCount(playlistId, {
          groups: stableGroups && stableGroups.length > 0 ? stableGroups : undefined,
          search: debouncedSearchRef.current || undefined,
          contentType: contentType || undefined,
          limit: pageSize,
          offset,
          sortBy: sortBy || undefined,
          sortOrder: sortOrder || 'asc',
          excludeAdult,
          favoriteIds: favoriteIdsRef.current.length > 0 ? favoriteIdsRef.current : undefined,
        });

        // Discard stale results from superseded fetches
        if (generation !== fetchGenerationRef.current) return;

        // Determine if there are more pages using the totalCount from the query
        const hasMorePages = offset + result.channels.length < result.totalCount;
        setHasMore(hasMorePages);

        if (isInitial) {
          setChannels(result.channels);
          setTotalCount(result.totalCount);

          // Write back to cache for unfiltered default views (only for default sort)
          if (playlistId && !debouncedSearchRef.current && (!stableGroups || stableGroups.length === 0) && !sortBy) {
            useFirstPageCacheStore.getState().setCachedChannels(
              playlistId, (contentType || 'live') as 'live' | 'movie', result.channels, result.totalCount
            );
          }
        } else {
          setChannels((prev) => [...prev, ...result.channels]);
        }

        offsetRef.current = offset + result.channels.length;
      } catch (err) {
        if (generation !== fetchGenerationRef.current) return;
        const message = err instanceof Error ? err.message : 'Failed to fetch channels';
        console.error('[usePaginatedChannels] Error:', message);
        setError(message);
        if (isInitial) {
          setChannels([]);
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
    [playlistId, stableGroups, contentType, pageSize, excludeAdult, sortBy, sortOrder]
  );

  // Reset and fetch first page when filters change
  useEffect(() => {
    // Don't clear data when hook is deactivated — stale data isn't rendered
    if (!playlistId) return;

    // Invalidate any in-flight fetch so its results are discarded
    fetchGenerationRef.current++;
    // Reset loading guard so new filter combinations can fetch
    isLoadingRef.current = false;

    // Clear any pending debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const isSearchChange = search !== debouncedSearchRef.current;

    const runFetch = () => {
      debouncedSearchRef.current = search;
      offsetRef.current = 0;

      // Check cache for unfiltered default views (only for default sort)
      const isDefaultView = !search && (!stableGroups || stableGroups.length === 0) && !sortBy;
      if (isDefaultView) {
        const cacheType = (contentType || 'live') as 'live' | 'movie';
        const cached = useFirstPageCacheStore.getState().getCachedChannels(playlistId, cacheType);
        const cachedExcludeAdult = useFirstPageCacheStore.getState().getExcludeAdult(playlistId);
        if (cached && cached.items.length > 0 && cachedExcludeAdult === excludeAdult) {
          setChannels(cached.items);
          setTotalCount(cached.totalCount);
          setHasMore(cached.items.length < cached.totalCount);
          setLoadedPlaylistId(playlistId);
          offsetRef.current = cached.items.length;
          // Skip network fetch when deferred (tab not yet active)
          if (deferNetworkFetch) return;
          // Background revalidation (no loading spinner)
          fetchPage(0, true, false);
          return;
        }
      }

      // When deferring and no cache, don't fetch — skeleton will show
      if (deferNetworkFetch) return;

      setChannels([]);
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
  }, [playlistId, stableGroups, search, contentType, excludeAdult, sortBy, sortOrder, deferNetworkFetch, fetchPage]);

  // Load more channels (next page)
  const loadMore = useCallback(() => {
    if (!hasMore || isLoadingRef.current) {
      return;
    }
    fetchPage(offsetRef.current, false);
  }, [hasMore, fetchPage]);

  // Refresh - reset to first page
  const refresh = useCallback(() => {
    offsetRef.current = 0;
    setChannels([]);
    setHasMore(true);
    fetchPage(0, true);
  }, [fetchPage]);

  // Consider loading if explicitly loading OR if playlistId changed but data hasn't loaded yet
  const isEffectivelyLoading = isLoading || (!!playlistId && loadedPlaylistId !== playlistId);

  return {
    channels,
    isLoading: isEffectivelyLoading,
    isLoadingMore,
    hasMore,
    error,
    loadMore,
    refresh,
    totalCount,
  };
}
