import {
  usePaginatedResource,
  type PaginatedFilters,
  type PaginatedPage,
  type PaginatedResourceCache,
} from '@/hooks/use-paginated-resource';
import { SERIES_ID_PREFIX } from '@/lib/channel-utils';
import { RustChannelService } from '@/services/rust-channel-service';
import { SERIES_CACHE_SLOT, useFirstPageCacheStore } from '@/stores/cache';
import type { SeriesInfo } from 'expo-m3u-parser';

const DEFAULT_PAGE_SIZE = 50;

interface UsePaginatedSeriesOptions {
  playlistId: string | null | undefined;
  groups?: string[];
  search?: string;
  pageSize?: number;
  excludeAdult?: boolean;
  favoriteChannelIds?: string[];
  sortOrder?: 'asc' | 'desc';
  /** When true, use cached data without triggering a network fetch. */
  deferNetworkFetch?: boolean;
}

interface UsePaginatedSeriesReturn {
  series: SeriesInfo[];
  isLoading: boolean;
  isLoadingMore: boolean;
  /** True while `refresh()` re-fetches; the loaded series stay on screen. */
  isRefreshing: boolean;
  hasMore: boolean;
  error: string | null;
  loadMore: () => void;
  refresh: () => void;
  retry: () => void;
  totalCount: number;
}

async function fetchSeriesPage(
  offset: number,
  filters: PaginatedFilters
): Promise<PaginatedPage<SeriesInfo>> {
  // Favourites are keyed by series name in the backend, not by the prefixed id
  // the rest of the app stores them under.
  const favoriteNames = filters.favoriteIds
    ?.filter((id) => id.startsWith(SERIES_ID_PREFIX))
    .map((id) => id.slice(SERIES_ID_PREFIX.length));

  const result = await RustChannelService.getSeriesList(filters.playlistId, {
    groups: filters.groups,
    search: filters.search,
    limit: filters.limit,
    offset,
    excludeAdult: filters.excludeAdult,
    favoriteNames: favoriteNames?.length ? favoriteNames : undefined,
    sortOrder: filters.sortOrder,
  });
  return { items: result.series, totalCount: result.totalCount };
}

/**
 * Reads and writes the shared first-page series slot — see `buildChannelCache`
 * in `use-paginated-channels.ts`.
 */
function buildSeriesCache(
  playlistId: string | null | undefined,
  excludeAdult: boolean | undefined
): PaginatedResourceCache<SeriesInfo> | undefined {
  if (!playlistId) return undefined;

  return {
    ...SERIES_CACHE_SLOT,
    read: () => useFirstPageCacheStore.getState().getCachedSeries(playlistId, excludeAdult),
    write: (page) => {
      useFirstPageCacheStore
        .getState()
        .setCachedSeries(playlistId, page.items, page.totalCount, excludeAdult);
    },
  };
}

/**
 * Paginated series loading with server-side filtering, on top of the shared
 * `usePaginatedResource` engine.
 */
export function usePaginatedSeries({
  playlistId,
  groups,
  search,
  pageSize = DEFAULT_PAGE_SIZE,
  excludeAdult,
  favoriteChannelIds,
  sortOrder,
  deferNetworkFetch,
}: UsePaginatedSeriesOptions): UsePaginatedSeriesReturn {
  const { items, ...rest } = usePaginatedResource<SeriesInfo>({
    playlistId,
    contentType: 'series',
    pageSize,
    groups,
    search,
    sortOrder,
    excludeAdult,
    favoriteIds: favoriteChannelIds,
    deferNetworkFetch,
    fetchPage: fetchSeriesPage,
    cache: buildSeriesCache(playlistId, excludeAdult),
    label: 'usePaginatedSeries',
  });

  return { series: items, ...rest };
}
