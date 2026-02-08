import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useFavoriteChannels } from '@/features/live/hooks/use-favorite-channels';
import { useFavoriteGroups } from '@/features/live/hooks/use-favorite-groups';
import { useGroups } from '@/features/live/hooks/use-groups';
import { usePaginatedChannels } from '@/features/live/hooks/use-paginated-channels';
import { usePlaylistData } from '@/features/live/hooks/use-playlist-data';
import { VideosScreenContent } from '@/features/videos/videos-screen-content';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getChannelId } from '@/lib/channel-utils';
import { FAVORITES_GROUP_SENTINEL } from '@/lib/group-utils';
import type { Channel } from '@/types/playlist.types';

export default function VideosScreen() {
  const router = useRouter();

  // Theme colors
  const iconColor = useThemeColor({}, 'icon');
  const tintColor = useThemeColor({}, 'tint');
  const backgroundColor = useThemeColor({}, 'background');

  // Content type toggle state
  const [contentType, setContentType] = useState<'movie' | 'series'>('movie');

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
  const { groups } = useGroups(activePlaylist?.id, contentType, favoriteGroups);

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

  // Paginated channels with server-side filtering
  const {
    channels,
    isLoading: isLoadingChannels,
    isLoadingMore,
    hasMore,
    loadMore,
    refresh: refreshChannels,
  } = usePaginatedChannels({
    playlistId: activePlaylist?.id,
    groups: channelGroups,
    search: searchText,
    contentType,
    favoriteChannelIds: favoriteChannels,
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

  const isLoading = !hasLoadedPlaylist || !hasLoadedFavorites || isInitialLoading || isLoadingChannels;

  // Combined refresh handler
  const handleCombinedRefresh = useCallback(() => {
    handleRefresh();
    refreshChannels();
  }, [handleRefresh, refreshChannels]);

  return (
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
      onChannelPress={handleChannelPress}
      onRefresh={handleCombinedRefresh}
      onLoadMore={loadMore}
      isLoadingMore={isLoadingMore}
      hasMore={hasMore}
      backgroundColor={backgroundColor}
      iconColor={iconColor}
      tintColor={tintColor}
      favoriteGroups={favoriteGroups}
      onToggleFavoriteGroup={toggleFavoriteGroup}
    />
  );
}
