import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { LiveScreenContent } from '@/components/domain/live/live-screen-content';
import { useFavoriteChannels } from '@/hooks/live/use-favorite-channels';
import { useFavoriteGroups } from '@/hooks/live/use-favorite-groups';
import { useGroups } from '@/hooks/live/use-groups';
import { usePaginatedChannels } from '@/hooks/live/use-paginated-channels';
import { usePlaylistData } from '@/hooks/live/use-playlist-data';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getChannelId } from '@/lib/channel-utils';
import { FAVORITES_GROUP_SENTINEL } from '@/lib/group-utils';
import type { Channel } from '@/types/playlist.types';

export default function LiveScreen() {
  const router = useRouter();

  // Theme colors
  const iconColor = useThemeColor({}, 'icon');
  const tintColor = useThemeColor({}, 'tint');
  const backgroundColor = useThemeColor({}, 'background');

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
  const { favoriteGroups, toggleFavorite: toggleFavoriteGroup } = useFavoriteGroups();

  // Server-side groups fetching (with favorites support)
  const { groups } = useGroups(activePlaylist?.id, 'live', favoriteGroups);

  // One-time default to Favorites when favorites load
  const hasSetDefaultGroup = useRef(false);
  useEffect(() => {
    if (!hasSetDefaultGroup.current && favoriteGroups.length > 0) {
      hasSetDefaultGroup.current = true;
      setSelectedGroupName(FAVORITES_GROUP_SENTINEL);
    }
  }, [favoriteGroups]);

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
    contentType: 'live',
    favoriteChannelIds: favoriteChannels,
  });

  // Event handlers for filters
  const handleGroupSelect = useCallback((groupName: string) => {
    setSelectedGroupName(groupName);
  }, []);

  const handleSearchTextChange = useCallback((text: string) => {
    setSearchText(text);
  }, []);

  // Event handlers
  const handleChannelPress = useCallback((channel: Channel) => {
    if (__DEV__) {
      console.log('Channel pressed:', channel.name);
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
    <LiveScreenContent
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

