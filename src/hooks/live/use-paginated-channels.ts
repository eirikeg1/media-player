import { useState, useEffect, useCallback, useRef } from 'react';
import { RustChannelService } from '@/services/rust-channel-service';
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
}: UsePaginatedChannelsOptions): UsePaginatedChannelsReturn {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);

  // Track current offset for pagination
  const offsetRef = useRef(0);
  // Track if we're currently loading to prevent duplicate requests
  const isLoadingRef = useRef(false);
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

      isLoadingRef.current = true;

      if (isInitial && showLoading) {
        setIsLoading(true);
      } else if (!isInitial) {
        setIsLoadingMore(true);
      }
      setError(null);

      try {
        const result = await RustChannelService.getChannelsFilteredWithCount(playlistId, {
          groups: groups && groups.length > 0 ? groups : undefined,
          search: debouncedSearchRef.current || undefined,
          contentType: contentType || undefined,
          limit: pageSize,
          offset,
          sortBy: 'title',
          sortOrder: 'asc',
        });

        // Determine if there are more pages using the totalCount from the query
        const hasMorePages = offset + result.channels.length < result.totalCount;
        setHasMore(hasMorePages);

        if (isInitial) {
          setChannels(result.channels);
          setTotalCount(result.totalCount);
        } else {
          setChannels((prev) => [...prev, ...result.channels]);
        }

        offsetRef.current = offset + result.channels.length;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch channels';
        console.error('[usePaginatedChannels] Error:', message);
        setError(message);
        if (isInitial) {
          setChannels([]);
        }
      } finally {
        isLoadingRef.current = false;
        if (isInitial && showLoading) {
          setIsLoading(false);
        } else if (!isInitial) {
          setIsLoadingMore(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [playlistId, JSON.stringify(groups), contentType, pageSize]
  );

  // Reset and fetch first page when filters change
  useEffect(() => {
    // Clear any pending debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const isSearchChange = search !== debouncedSearchRef.current;

    // Debounce search changes
    debounceTimerRef.current = setTimeout(() => {
      debouncedSearchRef.current = search;
      offsetRef.current = 0;

      setChannels([]);
      setHasMore(true);
      fetchPage(0, true);
    }, isSearchChange ? SEARCH_DEBOUNCE_MS : 0);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlistId, JSON.stringify(groups), search, contentType, fetchPage]);

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

  // Mark favorites in the channel list (favorites appear in natural position with star icon)
  // This is a lightweight client-side operation since favoriteChannelIds is typically small
  const channelsWithFavoriteInfo = channels;

  return {
    channels: channelsWithFavoriteInfo,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    loadMore,
    refresh,
    totalCount,
  };
}
