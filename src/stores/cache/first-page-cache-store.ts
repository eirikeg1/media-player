import { create } from 'zustand';
import type { SeriesInfo } from 'expo-m3u-parser';
import type { Channel } from '@/types/playlist.types';
import type { GroupOption } from '@/lib/group-utils';
import type { ChannelSortBy } from '@/types/sort.types';
import type { ContentReactionValue, RecentlyWatchedItem } from '@/types/user.types';
import { processRawGroupCounts } from '@/lib/group-utils';
import { RustChannelService } from '@/services/rust-channel-service';
import {
  loadPersonalizedContent,
  type PersonalizedContent,
} from '@/features/home/hooks/load-personalized-content';
import { loadRecentlyWatched } from '@/features/home/hooks/load-recently-watched';

/**
 * A slot holds one specific query, so every value that shapes the result is
 * recorded with it: a reader whose query differs on any dimension must fetch
 * for itself rather than be served someone else's page.
 */
interface CachedPage<T> {
  items: T[];
  totalCount: number;
  /** The adult filter the page was fetched under. */
  excludeAdult: boolean | undefined;
}

interface CachedGroups {
  groups: GroupOption[];
  excludeAdult: boolean | undefined;
}

type ContentType = 'live' | 'movie';
type GroupContentType = 'live' | 'movie' | 'series';

/** The ordering and page size a pre-fetched slot is written with. */
interface CacheSlotShape {
  pageSize: number;
  sortBy?: ChannelSortBy;
  sortOrder: 'asc' | 'desc';
}

/**
 * The exact query `preFetchAll` writes each channel slot with — the tab's own
 * default view, so the screen can render the pre-fetched page instead of
 * fetching an identical one. The Live tab defaults to playlist order (no
 * `sortBy`); the Movies tab defaults to alphabetical. `usePaginatedChannels`
 * reads these same declarations, so the two sides cannot drift apart.
 */
export const CHANNEL_CACHE_SLOTS: Record<ContentType, CacheSlotShape> = {
  live: { pageSize: 100, sortOrder: 'asc' },
  movie: { pageSize: 50, sortBy: 'title', sortOrder: 'asc' },
};

/** The same declaration for the series slot, read by `usePaginatedSeries`. */
export const SERIES_CACHE_SLOT: CacheSlotShape = { pageSize: 50, sortOrder: 'asc' };

/**
 * The row counts `preFetchAll` fills the home slot with — the home screen's own
 * rows, so it can render the pre-fetched batch instead of loading an identical
 * one. The screen reads these same declarations, so the two cannot drift apart.
 */
export const HOME_CACHE_SLOT = {
  /** "Continue Watching" cards. */
  recentlyWatchedLimit: 20,
  /** Titles per discover row. */
  contentLimit: 30,
} as const;

/**
 * How long a pre-fetched home slice counts as fresh.
 *
 * Long enough to cover the gap between the launch pre-fetch and the home screen
 * mounting — that fetch is the hooks' first one, not an extra — and short enough
 * that coming back to a tab left open for a while still revalidates.
 */
export const HOME_CACHE_FRESH_MS = 60_000;

/** Whether a slice loaded at `fetchedAt` still stands without a refetch. */
export function isHomeCacheFresh(fetchedAt: number): boolean {
  return Date.now() - fetchedAt <= HOME_CACHE_FRESH_MS;
}

/**
 * What a cached home slice was built for. Any difference reads as a miss:
 * another user's history, another adult filter or a shorter row would all put
 * the wrong thing on screen.
 */
export interface HomeSliceKey {
  playlistId: string;
  userId: string;
  excludeAdult: boolean;
  /** The row count the slice was loaded with. */
  limit: number;
}

/** The continue-watching slice additionally follows the history's revision. */
export interface RecentlyWatchedKey extends HomeSliceKey {
  /** `recentlyWatchedVersion`: a finished watch makes the stored rows wrong. */
  version: number;
}

/** A cached home slice, with what it was built for and when. */
export interface CachedHomeSlice<T, K extends HomeSliceKey = HomeSliceKey> {
  value: T;
  key: K;
  /** Unix ms of the load, so a slice this session filled needs no refetch. */
  fetchedAt: number;
}

/**
 * One playlist's home page. The two halves load independently (the carousel is
 * the slower of the two) and are written by whichever of the pre-fetch and the
 * hooks gets there first, so each keeps its own key and timestamp.
 */
interface CachedHome {
  recentlyWatched: CachedHomeSlice<RecentlyWatchedItem[], RecentlyWatchedKey> | null;
  content: CachedHomeSlice<PersonalizedContent> | null;
}

/** Everything the pre-fetch needs about the user to fill the home slot. */
export interface HomePrefetchInput {
  userId: string;
  /** The user's likes and dislikes, as the user store holds them. */
  reactions: Record<string, ContentReactionValue>;
  /** The history revision at pre-fetch time; see {@link RecentlyWatchedKey}. */
  recentlyWatchedVersion: number;
}

function sameHomeSlice(a: HomeSliceKey, b: HomeSliceKey): boolean {
  return (
    a.playlistId === b.playlistId &&
    a.userId === b.userId &&
    a.excludeAdult === b.excludeAdult &&
    a.limit === b.limit
  );
}

interface FirstPageCacheState {
  // Cached first pages keyed by playlistId
  channels: Record<string, Record<ContentType, CachedPage<Channel> | null>>;
  series: Record<string, CachedPage<SeriesInfo> | null>;
  groups: Record<string, Record<GroupContentType, CachedGroups | null>>;
  home: Record<string, CachedHome | null>;

  // Synchronous reads. A slot cached under a different adult filter reads as a
  // miss: serving it would show content the current setting filters out.
  getCachedChannels: (
    playlistId: string,
    contentType: ContentType,
    excludeAdult: boolean | undefined,
  ) => CachedPage<Channel> | null;
  getCachedSeries: (
    playlistId: string,
    excludeAdult: boolean | undefined,
  ) => CachedPage<SeriesInfo> | null;
  getCachedGroups: (
    playlistId: string,
    contentType: GroupContentType,
    excludeAdult: boolean | undefined,
  ) => GroupOption[] | null;

  // Writes after fetch. The adult filter the page was fetched under is recorded
  // with it, so any fetch may write its slot — no caller has to guess whether
  // the slot it is about to overwrite would end up mislabelled.
  setCachedChannels: (
    playlistId: string,
    contentType: ContentType,
    items: Channel[],
    totalCount: number,
    excludeAdult: boolean | undefined,
  ) => void;
  setCachedSeries: (
    playlistId: string,
    items: SeriesInfo[],
    totalCount: number,
    excludeAdult: boolean | undefined,
  ) => void;
  setCachedGroups: (
    playlistId: string,
    contentType: GroupContentType,
    groups: GroupOption[],
    excludeAdult: boolean | undefined,
  ) => void;

  /**
   * The home page's own rows. Read synchronously on mount so the screen renders
   * populated, then revalidated behind what is on screen.
   */
  getCachedRecentlyWatched: (
    key: RecentlyWatchedKey,
  ) => CachedHomeSlice<RecentlyWatchedItem[], RecentlyWatchedKey> | null;
  setCachedRecentlyWatched: (key: RecentlyWatchedKey, items: RecentlyWatchedItem[]) => void;
  getCachedHomeContent: (key: HomeSliceKey) => CachedHomeSlice<PersonalizedContent> | null;
  setCachedHomeContent: (key: HomeSliceKey, content: PersonalizedContent) => void;
  /**
   * Drop one half of a playlist's cached home page.
   *
   * What an explicit refresh calls before it loads: the user has declared the
   * rows on screen stale, so the slice behind them must not outlive them. A
   * refresh that never lands — the user leaves the page, superseding the run
   * before it can write — would otherwise leave the pre-refresh slice in the
   * slot, still timestamped fresh, for the next mount to serve straight back.
   */
  invalidateHomeSlice: (playlistId: string, slice: keyof CachedHome) => void;

  // Pre-fetch all content types in parallel. `home` is absent when no user is
  // signed in, which is also the only case where the home page has nothing to
  // show.
  preFetchAll: (
    playlistId: string,
    excludeAdult: boolean,
    favoriteChannelIds?: string[],
    home?: HomePrefetchInput,
  ) => Promise<void>;

  // Invalidation
  invalidatePlaylist: (playlistId: string) => void;
}

export const useFirstPageCacheStore = create<FirstPageCacheState>((set, get) => ({
  channels: {},
  series: {},
  groups: {},
  home: {},

  getCachedChannels: (playlistId, contentType, excludeAdult) => {
    const slot = get().channels[playlistId]?.[contentType] ?? null;
    return slot?.excludeAdult === excludeAdult ? slot : null;
  },

  getCachedSeries: (playlistId, excludeAdult) => {
    const slot = get().series[playlistId] ?? null;
    return slot?.excludeAdult === excludeAdult ? slot : null;
  },

  getCachedGroups: (playlistId, contentType, excludeAdult) => {
    const slot = get().groups[playlistId]?.[contentType] ?? null;
    return slot && slot.excludeAdult === excludeAdult ? slot.groups : null;
  },

  setCachedChannels: (playlistId, contentType, items, totalCount, excludeAdult) => {
    set((state) => ({
      channels: {
        ...state.channels,
        [playlistId]: {
          ...state.channels[playlistId],
          [contentType]: { items, totalCount, excludeAdult },
        },
      },
    }));
  },

  setCachedSeries: (playlistId, items, totalCount, excludeAdult) => {
    set((state) => ({
      series: {
        ...state.series,
        [playlistId]: { items, totalCount, excludeAdult },
      },
    }));
  },

  getCachedRecentlyWatched: (key) => {
    const slice = get().home[key.playlistId]?.recentlyWatched ?? null;
    return slice && sameHomeSlice(slice.key, key) && slice.key.version === key.version
      ? slice
      : null;
  },

  setCachedRecentlyWatched: (key, items) => {
    set((state) => ({
      home: {
        ...state.home,
        [key.playlistId]: {
          content: state.home[key.playlistId]?.content ?? null,
          recentlyWatched: { value: items, key, fetchedAt: Date.now() },
        },
      },
    }));
  },

  getCachedHomeContent: (key) => {
    const slice = get().home[key.playlistId]?.content ?? null;
    return slice && sameHomeSlice(slice.key, key) ? slice : null;
  },

  setCachedHomeContent: (key, content) => {
    set((state) => ({
      home: {
        ...state.home,
        [key.playlistId]: {
          recentlyWatched: state.home[key.playlistId]?.recentlyWatched ?? null,
          content: { value: content, key, fetchedAt: Date.now() },
        },
      },
    }));
  },

  invalidateHomeSlice: (playlistId, slice) => {
    set((state) => {
      const cached = state.home[playlistId];
      if (!cached || cached[slice] === null) return state;
      return { home: { ...state.home, [playlistId]: { ...cached, [slice]: null } } };
    });
  },

  setCachedGroups: (playlistId, contentType, groups, excludeAdult) => {
    set((state) => ({
      groups: {
        ...state.groups,
        [playlistId]: {
          ...state.groups[playlistId],
          [contentType]: { groups, excludeAdult },
        },
      },
    }));
  },

  preFetchAll: async (playlistId, excludeAdultSetting, favoriteChannelIds, home) => {
    const favoriteIds = favoriteChannelIds && favoriteChannelIds.length > 0
      ? favoriteChannelIds : undefined;

    // Started alongside the catalogue queries below rather than after them: the
    // home page is what the splash is usually waiting for, and the two hit
    // different backends. This *is* the home hooks' first load — they serve
    // what it writes instead of repeating it — so it adds no requests.
    const homePrefetch = home
      ? preFetchHome(playlistId, excludeAdultSetting, favoriteChannelIds ?? [], home, get)
      : null;

    // Extract series favorite names from IDs with "series:" prefix
    const favoriteNames = favoriteChannelIds
      ?.filter((id) => id.startsWith('series:'))
      .map((id) => id.slice(7));

    // Every slice is cached on its own: one failing query must not throw away
    // the five that succeeded (the screens for those would then fetch from
    // scratch and show a skeleton).
    const results = await Promise.allSettled([
      RustChannelService.getChannelsFilteredWithCount(playlistId, {
        contentType: 'live',
        limit: CHANNEL_CACHE_SLOTS.live.pageSize,
        offset: 0,
        sortBy: CHANNEL_CACHE_SLOTS.live.sortBy,
        sortOrder: CHANNEL_CACHE_SLOTS.live.sortOrder,
        excludeAdult: excludeAdultSetting,
        favoriteIds,
      }),
      RustChannelService.getChannelsFilteredWithCount(playlistId, {
        contentType: 'movie',
        limit: CHANNEL_CACHE_SLOTS.movie.pageSize,
        offset: 0,
        sortBy: CHANNEL_CACHE_SLOTS.movie.sortBy,
        sortOrder: CHANNEL_CACHE_SLOTS.movie.sortOrder,
        excludeAdult: excludeAdultSetting,
        favoriteIds,
      }),
      RustChannelService.getSeriesList(playlistId, {
        limit: SERIES_CACHE_SLOT.pageSize,
        offset: 0,
        sortOrder: SERIES_CACHE_SLOT.sortOrder,
        excludeAdult: excludeAdultSetting,
        favoriteNames: favoriteNames && favoriteNames.length > 0
          ? favoriteNames : undefined,
      }),
      RustChannelService.getGroupsWithCountsByPlaylist(playlistId, 'live', excludeAdultSetting),
      RustChannelService.getGroupsWithCountsByPlaylist(playlistId, 'movie', excludeAdultSetting),
      RustChannelService.getGroupsWithCountsByPlaylist(playlistId, 'series', excludeAdultSetting),
    ] as const);

    const [liveChannels, movieChannels, seriesResult, liveGroups, movieGroups, seriesGroups] = results;

    /** The fetched value, or null after logging why the slice is missing. */
    const valueOf = <T,>(result: PromiseSettledResult<T>, label: string): T | null => {
      if (result.status === 'fulfilled') return result.value;
      console.warn(`[FirstPageCache] Pre-fetch of ${label} failed (non-fatal):`, result.reason);
      return null;
    };

    const state = get();
    // A failed slice keeps what was cached before, but only while that slot was
    // built with the same adult filter — otherwise it must not be served under
    // the new setting.
    const keepStale = <S extends { excludeAdult: boolean | undefined }>(
      slot: S | null | undefined,
    ): S | null => (slot && slot.excludeAdult === excludeAdultSetting ? slot : null);

    const cachedChannels = state.channels[playlistId];
    const cachedGroups = state.groups[playlistId];

    const live = valueOf(liveChannels, 'live channels');
    const movie = valueOf(movieChannels, 'movies');
    const series = valueOf(seriesResult, 'series');
    const liveGroupCounts = valueOf(liveGroups, 'live groups');
    const movieGroupCounts = valueOf(movieGroups, 'movie groups');
    const seriesGroupCounts = valueOf(seriesGroups, 'series groups');

    const groupSlot = (
      counts: Awaited<ReturnType<typeof RustChannelService.getGroupsWithCountsByPlaylist>> | null,
      stale: CachedGroups | null | undefined,
    ): CachedGroups | null =>
      counts
        ? { groups: processRawGroupCounts(counts), excludeAdult: excludeAdultSetting }
        : keepStale(stale);

    set({
      channels: {
        ...state.channels,
        [playlistId]: {
          live: live
            ? { items: live.channels, totalCount: live.totalCount, excludeAdult: excludeAdultSetting }
            : keepStale(cachedChannels?.live),
          movie: movie
            ? { items: movie.channels, totalCount: movie.totalCount, excludeAdult: excludeAdultSetting }
            : keepStale(cachedChannels?.movie),
        },
      },
      series: {
        ...state.series,
        [playlistId]: series
          ? { items: series.series, totalCount: series.totalCount, excludeAdult: excludeAdultSetting }
          : keepStale(state.series[playlistId]),
      },
      groups: {
        ...state.groups,
        [playlistId]: {
          live: groupSlot(liveGroupCounts, cachedGroups?.live),
          movie: groupSlot(movieGroupCounts, cachedGroups?.movie),
          series: groupSlot(seriesGroupCounts, cachedGroups?.series),
        },
      },
    });

    await homePrefetch;

    console.log('[FirstPageCache] Pre-fetched content for playlist:', playlistId);
  },

  invalidatePlaylist: (playlistId) => {
    set((state) => {
      const { [playlistId]: _channels, ...restChannels } = state.channels;
      const { [playlistId]: _series, ...restSeries } = state.series;
      const { [playlistId]: _groups, ...restGroups } = state.groups;
      const { [playlistId]: _home, ...restHome } = state.home;
      return {
        channels: restChannels,
        series: restSeries,
        groups: restGroups,
        home: restHome,
      };
    });
  },
}));

/**
 * Fill the home slot with the very rows the home screen will render.
 *
 * Each half is written on its own: the carousel and the discover rows are
 * independent loads, and one failing only means that half's hook does its own
 * first fetch — with its skeleton — as it did before this cache existed.
 */
async function preFetchHome(
  playlistId: string,
  excludeAdult: boolean,
  favoriteIds: string[],
  home: HomePrefetchInput,
  get: () => FirstPageCacheState,
): Promise<void> {
  const { userId, reactions, recentlyWatchedVersion } = home;
  const recentlyWatchedKey: RecentlyWatchedKey = {
    playlistId,
    userId,
    excludeAdult,
    limit: HOME_CACHE_SLOT.recentlyWatchedLimit,
    version: recentlyWatchedVersion,
  };
  const contentKey: HomeSliceKey = {
    playlistId,
    userId,
    excludeAdult,
    limit: HOME_CACHE_SLOT.contentLimit,
  };

  const [recentlyWatched, content] = await Promise.allSettled([
    loadRecentlyWatched(recentlyWatchedKey),
    loadPersonalizedContent({ ...contentKey, reactions, favoriteIds }),
  ]);

  if (recentlyWatched.status === 'fulfilled') {
    get().setCachedRecentlyWatched(recentlyWatchedKey, recentlyWatched.value);
  } else {
    console.warn(
      '[FirstPageCache] Pre-fetch of continue watching failed (non-fatal):',
      recentlyWatched.reason,
    );
  }

  if (content.status === 'fulfilled') {
    get().setCachedHomeContent(contentKey, content.value);
  } else {
    console.warn(
      '[FirstPageCache] Pre-fetch of discover rows failed (non-fatal):',
      content.reason,
    );
  }
}
