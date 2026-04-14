import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ChannelDetailModal } from '@/features/live/channel-detail-modal';
import { LiveScreenContent } from '@/features/live/live-screen-content';
import { useCurrentProgrammes } from '@/features/live/hooks/use-current-programmes';
import type { LiveViewMode } from '@/features/live/live-top-bar';
import { useFavoriteChannels } from '@/features/live/hooks/use-favorite-channels';
import { useFavoriteGroups } from '@/features/live/hooks/use-favorite-groups';
import { useGroups } from '@/features/live/hooks/use-groups';
import { usePaginatedChannels } from '@/features/live/hooks/use-paginated-channels';
import { usePlaylistData } from '@/features/live/hooks/use-playlist-data';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getChannelId } from '@/lib/channel-utils';
import { FAVORITES_GROUP_SENTINEL, getEffectiveFavoriteGroups } from '@/lib/group-utils';
import { EpgService } from '@/services/epg-service';
import { useFirstPageCacheStore } from '@/stores/cache';
import { usePlaybackQueueStore } from '@/stores/video/queue-store';
import { useUserStore } from '@/stores/user/user-store';
import { LIVE_SORT_OPTIONS } from '@/types/sort.types';
import type { Channel } from '@/types/playlist.types';
import type { EpgProgramme } from 'expo-m3u-parser';

export default function LiveScreen() {
  const router = useRouter();

  // Theme colors
  const iconColor = useThemeColor({}, 'icon');
  const tintColor = useThemeColor({}, 'tint');
  const backgroundColor = useThemeColor({}, 'background');

  // Parental control: exclude adult content when enabled
  const excludeAdult = useUserStore((s) => s.currentUser?.settings?.parentalControlEnabled ?? false);

  // View mode: channels grid vs EPG guide
  const [viewMode, setViewMode] = useState<LiveViewMode>('channels');

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

  // Derive selectedGroupName: user selection takes priority, otherwise default to all channels
  const selectedGroupName = userGroupSelection ?? '';

  // Defer fetching until favorites are resolved; also wait for favorite groups when that filter is active
  const shouldDeferFetch = !hasLoadedFavorites
    || (selectedGroupName === FAVORITES_GROUP_SENTINEL && (isLoadingFavoriteGroups || groups.length === 0));

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
    playlistId: activePlaylist?.id,
    groups: channelGroups,
    search: searchText,
    contentType: 'live',
    favoriteChannelIds: favoriteChannels,
    excludeAdult,
    pageSize: 100,
    sortBy: activeSortOption.sortBy,
    sortOrder,
    deferNetworkFetch: shouldDeferFetch,
  });

  // EPG: bulk current programmes for visible channels
  const { programmes: currentProgrammes } = useCurrentProgrammes(channels);

  // Channel detail modal state
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [channelModalVisible, setChannelModalVisible] = useState(false);
  const [nextProgramme, setNextProgramme] = useState<EpgProgramme | null>(null);
  const nextProgrammeFetchRef = useRef(0);

  // Fetch next programme when modal opens
  useEffect(() => {
    if (!channelModalVisible || !selectedChannel?.tvg?.id) {
      setNextProgramme(null);
      return;
    }

    const fetchId = ++nextProgrammeFetchRef.current;
    EpgService.getNextProgramme(selectedChannel.tvg.id)
      .then((result) => {
        if (fetchId === nextProgrammeFetchRef.current) {
          setNextProgramme(result);
        }
      })
      .catch(() => {
        if (fetchId === nextProgrammeFetchRef.current) {
          setNextProgramme(null);
        }
      });
  }, [channelModalVisible, selectedChannel]);

  // View mode toggle handler
  const handleViewModeChange = useCallback((mode: LiveViewMode) => {
    setViewMode(mode);
  }, []);

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

  // Tap opens info modal instead of playing directly
  const handleChannelPress = useCallback((channel: Channel) => {
    setSelectedChannel(channel);
    setChannelModalVisible(true);
  }, []);

  // Play from modal
  const handlePlayPress = useCallback((channel: Channel) => {
    setChannelModalVisible(false);

    // Populate playback queue with currently loaded channels
    const queueItems = channels.map(ch => ({
      channelId: getChannelId(ch),
      channel: ch,
    }));
    const currentIndex = queueItems.findIndex(
      item => item.channelId === getChannelId(channel)
    );
    usePlaybackQueueStore.getState().setQueue(
      queueItems,
      currentIndex >= 0 ? currentIndex : 0
    );

    router.push({
      pathname: '/video-player',
      params: {
        channelId: getChannelId(channel),
        playlistId: activePlaylist?.id ?? '',
        contentType: 'live',
      },
    });
  }, [router, activePlaylist?.id, channels]);

  const handleModalClose = useCallback(() => {
    setChannelModalVisible(false);
  }, []);

  const isLoading = !hasLoadedPlaylist
    || (!!activePlaylist && isLoadingChannels && channels.length === 0);

  // Combined refresh handler
  const handleCombinedRefresh = useCallback(() => {
    if (activePlaylist?.id) {
      useFirstPageCacheStore.getState().invalidatePlaylist(activePlaylist.id);
    }
    handleRefresh();
    refreshChannels();
  }, [handleRefresh, refreshChannels, activePlaylist?.id]);

  // Get current programme for selected channel (for modal)
  const selectedChannelProgramme = selectedChannel?.tvg?.id
    ? currentProgrammes.get(selectedChannel.tvg.id) ?? null
    : null;

  return (
    <>
      <LiveScreenContent
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
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
        currentProgrammes={currentProgrammes}
        excludeAdult={excludeAdult}
      />

      <ChannelDetailModal
        visible={channelModalVisible}
        onClose={handleModalClose}
        channel={selectedChannel}
        playlistId={activePlaylist?.id}
        onPlayPress={handlePlayPress}
        currentProgramme={selectedChannelProgramme}
        nextProgramme={nextProgramme}
      />
    </>
  );
}
