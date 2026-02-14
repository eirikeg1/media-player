import { create } from 'zustand';
import type { SeriesInfo } from 'expo-m3u-parser';
import type { Channel } from '@/types/playlist.types';
import type { GroupOption } from '@/lib/group-utils';
import { processRawGroupCounts } from '@/lib/group-utils';
import { RustChannelService } from '@/services/rust-channel-service';

interface CachedPage<T> {
  items: T[];
  totalCount: number;
}

type ContentType = 'live' | 'movie';
type GroupContentType = 'live' | 'movie' | 'series';

interface FirstPageCacheState {
  // Cached first pages keyed by playlistId
  channels: Record<string, Record<ContentType, CachedPage<Channel> | null>>;
  series: Record<string, CachedPage<SeriesInfo> | null>;
  groups: Record<string, Record<GroupContentType, GroupOption[] | null>>;
  // Tracks the excludeAdult setting used when caching
  excludeAdult: Record<string, boolean>;

  // Synchronous reads
  getCachedChannels: (playlistId: string, contentType: ContentType) => CachedPage<Channel> | null;
  getCachedSeries: (playlistId: string) => CachedPage<SeriesInfo> | null;
  getCachedGroups: (playlistId: string, contentType: GroupContentType) => GroupOption[] | null;
  getExcludeAdult: (playlistId: string) => boolean | undefined;

  // Writes after fetch
  setCachedChannels: (playlistId: string, contentType: ContentType, items: Channel[], totalCount: number) => void;
  setCachedSeries: (playlistId: string, items: SeriesInfo[], totalCount: number) => void;
  setCachedGroups: (playlistId: string, contentType: GroupContentType, groups: GroupOption[]) => void;

  // Pre-fetch all content types in parallel
  preFetchAll: (playlistId: string, excludeAdult: boolean, favoriteChannelIds?: string[]) => Promise<void>;

  // Invalidation
  invalidatePlaylist: (playlistId: string) => void;
}

export const useFirstPageCacheStore = create<FirstPageCacheState>((set, get) => ({
  channels: {},
  series: {},
  groups: {},
  excludeAdult: {},

  getCachedChannels: (playlistId, contentType) => {
    return get().channels[playlistId]?.[contentType] ?? null;
  },

  getCachedSeries: (playlistId) => {
    return get().series[playlistId] ?? null;
  },

  getCachedGroups: (playlistId, contentType) => {
    return get().groups[playlistId]?.[contentType] ?? null;
  },

  getExcludeAdult: (playlistId) => {
    return get().excludeAdult[playlistId];
  },

  setCachedChannels: (playlistId, contentType, items, totalCount) => {
    set((state) => ({
      channels: {
        ...state.channels,
        [playlistId]: {
          ...state.channels[playlistId],
          [contentType]: { items, totalCount },
        },
      },
    }));
  },

  setCachedSeries: (playlistId, items, totalCount) => {
    set((state) => ({
      series: {
        ...state.series,
        [playlistId]: { items, totalCount },
      },
    }));
  },

  setCachedGroups: (playlistId, contentType, groups) => {
    set((state) => ({
      groups: {
        ...state.groups,
        [playlistId]: {
          ...state.groups[playlistId],
          [contentType]: groups,
        },
      },
    }));
  },

  preFetchAll: async (playlistId, excludeAdultSetting, favoriteChannelIds) => {
    try {
      const favoriteIds = favoriteChannelIds && favoriteChannelIds.length > 0
        ? favoriteChannelIds : undefined;

      // Extract series favorite names from IDs with "series:" prefix
      const favoriteNames = favoriteChannelIds
        ?.filter((id) => id.startsWith('series:'))
        .map((id) => id.slice(7));

      const [liveChannels, movieChannels, seriesResult, liveGroups, movieGroups, seriesGroups] =
        await Promise.all([
          RustChannelService.getChannelsFilteredWithCount(playlistId, {
            contentType: 'live',
            limit: 100,
            offset: 0,
            sortBy: 'title',
            sortOrder: 'asc',
            excludeAdult: excludeAdultSetting,
            favoriteIds,
          }),
          RustChannelService.getChannelsFilteredWithCount(playlistId, {
            contentType: 'movie',
            limit: 50,
            offset: 0,
            sortBy: 'title',
            sortOrder: 'asc',
            excludeAdult: excludeAdultSetting,
            favoriteIds,
          }),
          RustChannelService.getSeriesList(playlistId, {
            limit: 50,
            offset: 0,
            excludeAdult: excludeAdultSetting,
            favoriteNames: favoriteNames && favoriteNames.length > 0
              ? favoriteNames : undefined,
          }),
          RustChannelService.getGroupsWithCountsByPlaylist(playlistId, 'live', excludeAdultSetting),
          RustChannelService.getGroupsWithCountsByPlaylist(playlistId, 'movie', excludeAdultSetting),
          RustChannelService.getGroupsWithCountsByPlaylist(playlistId, 'series', excludeAdultSetting),
        ]);

      set({
        channels: {
          ...get().channels,
          [playlistId]: {
            live: { items: liveChannels.channels, totalCount: liveChannels.totalCount },
            movie: { items: movieChannels.channels, totalCount: movieChannels.totalCount },
          },
        },
        series: {
          ...get().series,
          [playlistId]: { items: seriesResult.series, totalCount: seriesResult.totalCount },
        },
        groups: {
          ...get().groups,
          [playlistId]: {
            live: processRawGroupCounts(liveGroups),
            movie: processRawGroupCounts(movieGroups),
            series: processRawGroupCounts(seriesGroups),
          },
        },
        excludeAdult: {
          ...get().excludeAdult,
          [playlistId]: excludeAdultSetting,
        },
      });

      console.log('[FirstPageCache] Pre-fetched all content for playlist:', playlistId);
    } catch (error) {
      console.warn('[FirstPageCache] Pre-fetch failed (non-fatal):', error);
    }
  },

  invalidatePlaylist: (playlistId) => {
    set((state) => {
      const { [playlistId]: _channels, ...restChannels } = state.channels;
      const { [playlistId]: _series, ...restSeries } = state.series;
      const { [playlistId]: _groups, ...restGroups } = state.groups;
      const { [playlistId]: _excludeAdult, ...restExcludeAdult } = state.excludeAdult;
      return {
        channels: restChannels,
        series: restSeries,
        groups: restGroups,
        excludeAdult: restExcludeAdult,
      };
    });
  },
}));
