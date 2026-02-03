import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { LiveScreenContent } from '@/components/domain/live/live-screen-content';
import { useChannelFiltering } from '@/hooks/live/use-channel-filtering';
import { useFavoriteChannels } from '@/hooks/live/use-favorite-channels';
import { usePlaylistChannels } from '@/hooks/live/use-playlist-channels';
import { usePlaylistData } from '@/hooks/live/use-playlist-data';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { Channel } from '@/types/playlist.types';

export default function LiveScreen() {
  const router = useRouter();

  // Theme colors
  const iconColor = useThemeColor({}, 'icon');
  const tintColor = useThemeColor({}, 'tint');
  const backgroundColor = useThemeColor({}, 'background');

  // Custom hooks for data management
  const { activePlaylist, hasLoadedPlaylist } = usePlaylistData();
  const { channels, isLoading: isLoadingChannels } = usePlaylistChannels(activePlaylist?.id);
  const {
    favoriteChannels,
    hasLoadedFavorites,
    isRefreshing,
    isInitialLoading,
    handleRefresh
  } = useFavoriteChannels(activePlaylist, hasLoadedPlaylist);

  const {
    filteredChannels,
    groups,
    selectedGroupName,
    searchText,
    handleGroupSelect,
    handleSearchTextChange
  } = useChannelFiltering(channels, favoriteChannels);

  // Event handlers
  const handleChannelPress = useCallback((channel: Channel) => {
    if (__DEV__) {
      console.log('Channel pressed:', channel.name);
    }

    router.push({
      pathname: '/video-player',
      params: {
        channel: JSON.stringify(channel),
      },
    });
  }, [router]);

  const isLoading = !hasLoadedPlaylist || !hasLoadedFavorites || isInitialLoading || isLoadingChannels;

  return (
    <LiveScreenContent
      isLoading={isLoading}
      playlist={activePlaylist}
      channels={filteredChannels}
      favoriteChannels={favoriteChannels}
      groups={groups}
      selectedGroup={selectedGroupName}
      searchText={searchText}
      isRefreshing={isRefreshing}
      onGroupSelect={handleGroupSelect}
      onSearchChange={handleSearchTextChange}
      onChannelPress={handleChannelPress}
      onRefresh={handleRefresh}
      backgroundColor={backgroundColor}
      iconColor={iconColor}
      tintColor={tintColor}
    />
  );
}

