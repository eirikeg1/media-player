import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

import { useReportLandingReady } from '@/features/launch/use-report-landing-ready';
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
import { channelHref } from '@/lib/detail-hrefs';
import { useFirstPageCacheStore } from '@/stores/cache';
import { usePlaybackQueueStore } from '@/stores/video/queue-store';
import { selectExcludeAdult, useUserStore } from '@/stores/user/user-store';
import { LIVE_SORT_OPTIONS } from '@/types/sort.types';
import type { Channel } from '@/types/playlist.types';

export default function LiveScreen() {
  const router = useRouter();

  // Theme colors
  const backgroundColor = useThemeColor({}, 'background');

  // Parental control: exclude adult content when enabled
  const excludeAdult = useUserStore((s) => selectExcludeAdult(s.currentUser));

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

  // Server-side groups fetching (with favorites support). Fetched once here and
  // passed to both the channel grid and the EPG guide.
  const {
    groups,
    isLoading: isLoadingGroups,
    error: groupsError,
    retry: retryGroups,
  } = useGroups(activePlaylist?.id, 'live', favoriteGroups, excludeAdult);

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

  // Defer fetching until favorites are resolved; also wait for the groups when
  // the favorites filter is active, since the query is derived from them. A
  // *failed* group fetch resolves too (with no groups), so this can never pin
  // the skeleton — which waiting on `groups.length` did.
  const shouldDeferFetch = !hasLoadedFavorites
    || (selectedGroupName === FAVORITES_GROUP_SENTINEL && (isLoadingFavoriteGroups || isLoadingGroups));

  // Translate FAVORITES_GROUP_SENTINEL for the paginated channels query. An empty
  // array is a filter that matches nothing — none of the favorite groups exist in
  // this playlist — as opposed to `undefined`, which means "no group filter".
  const channelGroups = selectedGroupName === FAVORITES_GROUP_SENTINEL
    ? getEffectiveFavoriteGroups(favoriteGroups, groups)
    : selectedGroupName
      ? [selectedGroupName]
      : undefined;
  const hasUnmatchedFavoriteGroups = channelGroups?.length === 0;

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
    isRefreshing: isRefreshingChannels,
    hasMore,
    loadMore,
    error: channelsError,
    refresh: refreshChannels,
    retry: retryChannels,
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

  // Populated enough to be worth revealing at launch: the first page is
  // normally pre-fetched, so this is true on the first render and the splash
  // never waits for this tab at all. An empty or playlist-less catalogue
  // reports too — there is nothing further to wait for.
  useReportLandingReady('live', channels.length > 0 || !isLoadingChannels);

  // EPG: bulk current programmes for visible channels
  const { programmes: currentProgrammes } = useCurrentProgrammes(channels);

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

  // Opening a channel is a navigation, not screen state: the detail route keeps
  // the grid mounted behind it and stays in history, so the player it launches
  // comes back to the channel rather than to the grid.
  //
  // The queue goes with it through the session store rather than the route
  // parameters — a live playlist is thousands of rows, far too many to
  // serialise into a URL. Staging it here is safe across the extra hop: only
  // the player's `startSession` consumes the hand-over, so it is still there
  // when playback finally starts (see `takeStagedQueue`).
  const handleChannelPress = useCallback((channel: Channel) => {
    const currentIndex = channels.findIndex(
      ch => getChannelId(ch) === getChannelId(channel)
    );
    usePlaybackQueueStore.getState().stageQueue(
      getChannelId(channel),
      channels,
      currentIndex >= 0 ? currentIndex : 0
    );

    router.push(channelHref(activePlaylist?.id ?? '', channel));
  }, [router, activePlaylist?.id, channels]);

  // Groups and channels fail independently; either failure must surface.
  const loadError = channelsError ?? groupsError;

  // While the fetch is deferred the loaded channels still belong to the previous
  // filter, so the screen must read as loading (mirrors videos.tsx) — unless
  // something failed, since a skeleton would hide the error and its retry.
  const isLoading = !loadError
    && (!hasLoadedPlaylist
      || (!!activePlaylist && (shouldDeferFetch || (isLoadingChannels && channels.length === 0))));

  // Combined refresh handler
  const handleCombinedRefresh = useCallback(() => {
    if (activePlaylist?.id) {
      useFirstPageCacheStore.getState().invalidatePlaylist(activePlaylist.id);
    }
    handleRefresh();
    refreshChannels();
  }, [handleRefresh, refreshChannels, activePlaylist?.id]);

  // Whichever query failed is the one to re-run; a failed group fetch has its
  // own retry, and neither knows about the other.
  const handleRetry = useCallback(() => {
    if (groupsError) retryGroups();
    if (channelsError || !groupsError) retryChannels();
  }, [groupsError, channelsError, retryGroups, retryChannels]);

  // The pull-to-refresh spinner has to cover the channel re-fetch as well, not
  // just the favorites reload.
  const isRefreshingAll = isRefreshing || isRefreshingChannels;

  return (
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
      isRefreshing={isRefreshingAll}
      error={loadError}
      onRetry={handleRetry}
      hasUnmatchedFavoriteGroups={hasUnmatchedFavoriteGroups}
      onGroupSelect={handleGroupSelect}
      onSearchChange={handleSearchTextChange}
      onChannelPress={handleChannelPress}
      onRefresh={handleCombinedRefresh}
      onLoadMore={loadMore}
      isLoadingMore={isLoadingMore}
      hasMore={hasMore}
      backgroundColor={backgroundColor}
      favoriteGroups={favoriteGroups}
      onToggleFavoriteGroup={toggleFavoriteGroup}
      sortOptions={LIVE_SORT_OPTIONS}
      selectedSortId={selectedSortId}
      sortOrder={sortOrder}
      onSortSelect={handleSortSelect}
      currentProgrammes={currentProgrammes}
      excludeAdult={excludeAdult}
    />
  );
}
