import { useRouter } from 'expo-router';
import type { SeriesInfo } from 'expo-m3u-parser';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useFavoriteChannels } from '@/features/live/hooks/use-favorite-channels';
import { useFavoriteGroups } from '@/features/live/hooks/use-favorite-groups';
import { useGroups } from '@/features/live/hooks/use-groups';
import { usePaginatedChannels } from '@/features/live/hooks/use-paginated-channels';
import { usePlaylistData } from '@/features/live/hooks/use-playlist-data';
import { usePaginatedSeries } from '@/features/videos/hooks/use-paginated-series';
import { MovieDetailModal } from '@/features/videos/movie-detail-modal';
import { SeriesDetailModal } from '@/features/videos/series-detail-modal';
import { VideosScreenContent } from '@/features/videos/videos-screen-content';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getChannelId } from '@/lib/channel-utils';
import { FAVORITES_GROUP_SENTINEL } from '@/lib/group-utils';
import { useUserStore } from '@/stores/user/user-store';
import type { Channel } from '@/types/playlist.types';

export default function VideosScreen() {
  const router = useRouter();

  // Theme colors
  const iconColor = useThemeColor({}, 'icon');
  const tintColor = useThemeColor({}, 'tint');
  const backgroundColor = useThemeColor({}, 'background');

  // Parental control: exclude adult content when enabled
  const excludeAdult = useUserStore((s) => s.currentUser?.settings?.parentalControlEnabled ?? false);

  // Content type toggle state
  const [contentType, setContentType] = useState<'movie' | 'series'>('movie');

  // Series detail modal state
  const [selectedSeries, setSelectedSeries] = useState<SeriesInfo | null>(null);
  const [seriesModalVisible, setSeriesModalVisible] = useState(false);

  // Movie detail modal state
  const [selectedMovie, setSelectedMovie] = useState<Channel | null>(null);
  const [movieModalVisible, setMovieModalVisible] = useState(false);

  // Filter state managed locally, passed to paginated hook
  const [selectedGroupName, setSelectedGroupName] = useState<string>('');
  const [searchText, setSearchText] = useState<string>('');

  // Custom hooks for data management
  const { activePlaylist, hasLoadedPlaylist } = usePlaylistData();
  const {
    favoriteChannels,
    hasLoadedFavorites,
    isRefreshing,
    isInitialLoading,
    handleRefresh
  } = useFavoriteChannels(activePlaylist, hasLoadedPlaylist);

  // Favorite groups (single source of truth — passed down to modal via props)
  const { favoriteGroups, isLoading: isLoadingFavoriteGroups, toggleFavorite: toggleFavoriteGroup } = useFavoriteGroups();

  // Server-side groups fetching (with favorites support)
  const { groups } = useGroups(activePlaylist?.id, contentType, favoriteGroups, excludeAdult);

  // Reset filter state when switching playlists
  const activePlaylistId = activePlaylist?.id;
  useEffect(() => {
    setSelectedGroupName('');
    setSearchText('');
    hasSetDefaultGroup.current = false;
  }, [activePlaylistId]);

  // Reset filter state when switching content type
  useEffect(() => {
    setSelectedGroupName('');
    setSearchText('');
    hasSetDefaultGroup.current = false;
  }, [contentType]);

  // One-time default: Favorites if available, otherwise All Channels
  const hasSetDefaultGroup = useRef(false);
  useEffect(() => {
    if (!hasSetDefaultGroup.current && !isLoadingFavoriteGroups) {
      hasSetDefaultGroup.current = true;
      if (favoriteGroups.length > 0) {
        setSelectedGroupName(FAVORITES_GROUP_SENTINEL);
      }
    }
  }, [favoriteGroups, isLoadingFavoriteGroups]);

  // Translate FAVORITES_GROUP_SENTINEL for the paginated channels query
  const channelGroups = selectedGroupName === FAVORITES_GROUP_SENTINEL
    ? favoriteGroups
    : selectedGroupName
      ? [selectedGroupName]
      : undefined;

  // Paginated channels with server-side filtering (active for movies)
  const {
    channels,
    isLoading: isLoadingChannels,
    isLoadingMore: isLoadingMoreChannels,
    hasMore: hasMoreChannels,
    loadMore: loadMoreChannels,
    refresh: refreshChannels,
  } = usePaginatedChannels({
    playlistId: contentType === 'movie' ? activePlaylist?.id : undefined,
    groups: channelGroups,
    search: searchText,
    contentType: 'movie',
    favoriteChannelIds: favoriteChannels,
    excludeAdult,
  });

  // Paginated series (active for series)
  const {
    series: seriesList,
    isLoading: isLoadingSeries,
    isLoadingMore: isLoadingMoreSeries,
    hasMore: hasMoreSeries,
    loadMore: loadMoreSeries,
    refresh: refreshSeries,
  } = usePaginatedSeries({
    playlistId: contentType === 'series' ? activePlaylist?.id : undefined,
    groups: channelGroups,
    search: searchText,
    excludeAdult,
  });

  // Event handlers for filters
  const handleGroupSelect = useCallback((groupName: string) => {
    setSelectedGroupName(groupName);
  }, []);

  const handleSearchTextChange = useCallback((text: string) => {
    setSearchText(text);
  }, []);

  const handleContentTypeChange = useCallback((type: 'movie' | 'series') => {
    setContentType(type);
  }, []);

  // Event handlers
  const handleChannelPress = useCallback((channel: Channel) => {
    if (__DEV__) {
      console.log('Video pressed:', channel.name);
    }

    router.push({
      pathname: '/video-player',
      params: {
        channelId: getChannelId(channel),
        playlistId: activePlaylist?.id ?? '',
      },
    });
  }, [router, activePlaylist?.id]);

  const handleSeriesPress = useCallback((series: SeriesInfo) => {
    setSelectedSeries(series);
    setSeriesModalVisible(true);
  }, []);

  const handleSeriesModalClose = useCallback(() => {
    setSeriesModalVisible(false);
  }, []);

  const handleEpisodePress = useCallback((channel: Channel) => {
    setSeriesModalVisible(false);
    handleChannelPress(channel);
  }, [handleChannelPress]);

  const handleMoviePress = useCallback((channel: Channel) => {
    setSelectedMovie(channel);
    setMovieModalVisible(true);
  }, []);

  const handleMovieModalClose = useCallback(() => {
    setMovieModalVisible(false);
  }, []);

  const handleMoviePlay = useCallback((channel: Channel) => {
    setMovieModalVisible(false);
    handleChannelPress(channel);
  }, [handleChannelPress]);

  // Determine loading/pagination state based on content type
  const isSeries = contentType === 'series';
  const isLoading = !hasLoadedPlaylist || !hasLoadedFavorites || isInitialLoading
    || (isSeries ? isLoadingSeries : isLoadingChannels);
  const isLoadingMore = isSeries ? isLoadingMoreSeries : isLoadingMoreChannels;
  const hasMore = isSeries ? hasMoreSeries : hasMoreChannels;
  const loadMore = isSeries ? loadMoreSeries : loadMoreChannels;

  // Combined refresh handler
  const handleCombinedRefresh = useCallback(() => {
    handleRefresh();
    if (isSeries) {
      refreshSeries();
    } else {
      refreshChannels();
    }
  }, [handleRefresh, refreshChannels, refreshSeries, isSeries]);

  return (
    <>
      <VideosScreenContent
        contentType={contentType}
        onContentTypeChange={handleContentTypeChange}
        isLoading={isLoading}
        playlist={activePlaylist}
        channels={channels}
        favoriteChannels={favoriteChannels}
        groups={groups}
        selectedGroup={selectedGroupName}
        searchText={searchText}
        isRefreshing={isRefreshing}
        onGroupSelect={handleGroupSelect}
        onSearchChange={handleSearchTextChange}
        onChannelPress={handleMoviePress}
        onRefresh={handleCombinedRefresh}
        onLoadMore={loadMore}
        isLoadingMore={isLoadingMore}
        hasMore={hasMore}
        backgroundColor={backgroundColor}
        iconColor={iconColor}
        tintColor={tintColor}
        favoriteGroups={favoriteGroups}
        onToggleFavoriteGroup={toggleFavoriteGroup}
        seriesList={seriesList}
        onSeriesPress={handleSeriesPress}
      />
      <MovieDetailModal
        visible={movieModalVisible}
        onClose={handleMovieModalClose}
        movie={selectedMovie}
        playlistId={activePlaylist?.id}
        onPlayPress={handleMoviePlay}
      />
      <SeriesDetailModal
        visible={seriesModalVisible}
        onClose={handleSeriesModalClose}
        series={selectedSeries}
        playlistId={activePlaylist?.id}
        onEpisodePress={handleEpisodePress}
      />
    </>
  );
}
