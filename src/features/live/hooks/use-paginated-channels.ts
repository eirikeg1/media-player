import {
  usePaginatedResource,
  type PaginatedFilters,
  type PaginatedPage,
  type PaginatedResourceCache,
} from '@/hooks/use-paginated-resource';
import { RustChannelService } from '@/services/rust-channel-service';
import { CHANNEL_CACHE_SLOTS, useFirstPageCacheStore } from '@/stores/cache';
import type { Channel } from '@/types/playlist.types';
import type { ChannelSortBy } from '@/types/sort.types';

const DEFAULT_PAGE_SIZE = 50;

/** Content types the first-page cache keeps a channel slot for. */
type CachedContentType = 'live' | 'movie';

interface UsePaginatedChannelsOptions {
  playlistId: string | null | undefined;
  groups?: string[];
  search?: string;
  contentType?: 'live' | 'movie' | 'series';
  favoriteChannelIds: string[];
  pageSize?: number;
  excludeAdult?: boolean;
  sortBy?: ChannelSortBy;
  sortOrder?: 'asc' | 'desc';
  /** When true, use cached data without triggering a network fetch. */
  deferNetworkFetch?: boolean;
}

interface UsePaginatedChannelsReturn {
  channels: Channel[];
  isLoading: boolean;
  isLoadingMore: boolean;
  /** True while `refresh()` re-fetches; the loaded channels stay on screen. */
  isRefreshing: boolean;
  hasMore: boolean;
  error: string | null;
  loadMore: () => void;
  refresh: () => void;
  retry: () => void;
  totalCount: number;
}

async function fetchChannelPage(
  offset: number,
  filters: PaginatedFilters<ChannelSortBy>
): Promise<PaginatedPage<Channel>> {
  const result = await RustChannelService.getChannelsFilteredWithCount(filters.playlistId, {
    groups: filters.groups,
    search: filters.search,
    contentType: filters.contentType,
    limit: filters.limit,
    offset,
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
    excludeAdult: filters.excludeAdult,
    favoriteIds: filters.favoriteIds,
  });
  return { items: result.channels, totalCount: result.totalCount };
}

/**
 * Reads and writes the shared first-page slot for one content type.
 *
 * Returns undefined for series, which has no channel slot. The slot's shape is
 * whatever `preFetchAll` wrote it with, so it is taken straight from the store's
 * declaration; the adult filter travels with the page itself, so a write can
 * never leave the slot mislabelled.
 */
function buildChannelCache(
  playlistId: string | null | undefined,
  contentType: 'live' | 'movie' | 'series' | undefined,
  excludeAdult: boolean | undefined
): PaginatedResourceCache<Channel> | undefined {
  const cacheType: CachedContentType = contentType === 'movie' ? 'movie' : 'live';
  if (!playlistId || contentType === 'series') return undefined;

  return {
    ...CHANNEL_CACHE_SLOTS[cacheType],
    read: () =>
      useFirstPageCacheStore.getState().getCachedChannels(playlistId, cacheType, excludeAdult),
    write: (page) => {
      useFirstPageCacheStore
        .getState()
        .setCachedChannels(playlistId, cacheType, page.items, page.totalCount, excludeAdult);
    },
  };
}

/**
 * Paginated channel loading with server-side filtering, on top of the shared
 * `usePaginatedResource` engine.
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
  const { items, ...rest } = usePaginatedResource<Channel, ChannelSortBy>({
    playlistId,
    contentType,
    pageSize,
    groups,
    search,
    sortBy,
    sortOrder,
    excludeAdult,
    favoriteIds: favoriteChannelIds,
    deferNetworkFetch,
    fetchPage: fetchChannelPage,
    cache: buildChannelCache(playlistId, contentType, excludeAdult),
    label: 'usePaginatedChannels',
  });

  return { channels: items, ...rest };
}
