import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

import { LiveScreenContent } from '@/features/live/live-screen-content';
import { useFavoriteChannels } from '@/features/live/hooks/use-favorite-channels';
import { useFavoriteGroups } from '@/features/live/hooks/use-favorite-groups';
import { useGroups } from '@/features/live/hooks/use-groups';
import { usePaginatedChannels } from '@/features/live/hooks/use-paginated-channels';
import { usePlaylistData } from '@/features/live/hooks/use-playlist-data';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getChannelId } from '@/lib/channel-utils';
import { FAVORITES_GROUP_SENTINEL, getEffectiveFavoriteGroups } from '@/lib/group-utils';
import { useFirstPageCacheStore } from '@/stores/cache';
import { useUserStore } from '@/stores/user/user-store';
import { LIVE_SORT_OPTIONS } from '@/types/sort.types';
import type { Channel } from '@/types/playlist.types';

export default function LiveScreen() {
  const router = useRouter();

  // Theme colors
  const iconColor = useThemeColor({}, 'icon');
  const tintColor = useThemeColor({}, 'tint');
  const backgroundColor = useThemeColor({}, 'background');

  // Parental control: exclude adult content when enabled
  const excludeAdult = useUserStore((s) => s.currentUser?.settings?.parentalControlEnabled ?? false);

  // Filter state managed locally, passed to paginated hook
  const [userGroupSelection, setUserGroupSelection] = useState<string | null>(null);
  const [searchText, setSearchText] = useState<string>('');
  const [selectedSortId, setSelectedSortId] = useState('playlist');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Custom hooks for data management
  const { activePlaylist, hasLoadedPlaylist } = usePlaylistData();
  const {
    favoriteChannels,
    hasLoadedFavorites,
    isRefreshing,
    handleRefresh
  } = useFavoriteChannels(activePlaylist, hasLoadedPlaylist);

  // Favorite groups (single source of truth — passed down to modal via props)
  const { favoriteGroups, isLoading: isLoadingFavoriteGroups, toggleFavorite: toggleFavoriteGroup } = useFavoriteGroups();

  // Server-side groups fetching (with favorites support)
  const { groups } = useGroups(activePlaylist?.id, 'live', favoriteGroups, excludeAdult);

  // Synchronous state derivation: reset filters on playlist change
  const activePlaylistId = activePlaylist?.id;
  const [prevActivePlaylistId, setPrevActivePlaylistId] = useState(activePlaylistId);

  if (activePlaylistId !== prevActivePlaylistId) {
    setPrevActivePlaylistId(activePlaylistId);
    setUserGroupSelection(null);
    setSearchText('');
    setSelectedSortId('playlist');
    setSortOrder('asc');
  }

  // Derive selectedGroupName: user selection takes priority, otherwise default to favorites
  const selectedGroupName = userGroupSelection !== null
    ? userGroupSelection
    : (!isLoadingFavoriteGroups && favoriteGroups.length > 0)
      ? FAVORITES_GROUP_SENTINEL
      : '';

  // Defer fetching until favorites + groups are resolved to prevent flash of unfiltered content
  const shouldDeferFetch = !hasLoadedFavorites || isLoadingFavoriteGroups
    || (selectedGroupName === FAVORITES_GROUP_SENTINEL && groups.length === 0);

  // Translate FAVORITES_GROUP_SENTINEL for the paginated channels query
  const channelGroups = selectedGroupName === FAVORITES_GROUP_SENTINEL
    ? getEffectiveFavoriteGroups(favoriteGroups, groups)
    : selectedGroupName
      ? [selectedGroupName]
      : undefined;

  // Derive sort params from selected option
  const activeSortOption = useMemo(
    () => LIVE_SORT_OPTIONS.find((o) => o.id === selectedSortId) ?? LIVE_SORT_OPTIONS[0],
    [selectedSortId],
  );

  // Paginated channels with server-side filtering
  const {
    channels,
    isLoading: isLoadingChannels,
    isLoadingMore,
    hasMore,
    loadMore,
    refresh: refreshChannels,
  } = usePaginatedChannels({
    playlistId: !shouldDeferFetch ? activePlaylist?.id : undefined,
    groups: channelGroups,
    search: searchText,
    contentType: 'live',
    favoriteChannelIds: favoriteChannels,
    excludeAdult,
    pageSize: 100,
    sortBy: activeSortOption.sortBy,
    sortOrder,
  });

  // Event handlers for filters
  const handleGroupSelect = useCallback((groupName: string) => {
    setUserGroupSelection(groupName);
  }, []);

  const handleSearchTextChange = useCallback((text: string) => {
    setSearchText(text);
  }, []);

  const handleSortSelect = useCallback((id: string) => {
    if (id === selectedSortId) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      const option = LIVE_SORT_OPTIONS.find((o) => o.id === id);
      setSelectedSortId(id);
      setSortOrder(option?.defaultOrder ?? 'asc');
    }
  }, [selectedSortId]);

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
        contentType: 'live',
      },
    });
  }, [router, activePlaylist?.id]);

  const isLoading = !hasLoadedPlaylist
    || (!!activePlaylist && (shouldDeferFetch || isLoadingChannels));

  // Combined refresh handler
  const handleCombinedRefresh = useCallback(() => {
    if (activePlaylist?.id) {
      useFirstPageCacheStore.getState().invalidatePlaylist(activePlaylist.id);
    }
    handleRefresh();
    refreshChannels();
  }, [handleRefresh, refreshChannels, activePlaylist?.id]);

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
      sortOptions={LIVE_SORT_OPTIONS}
      selectedSortId={selectedSortId}
      sortOrder={sortOrder}
      onSortSelect={handleSortSelect}
    />
  );
}

