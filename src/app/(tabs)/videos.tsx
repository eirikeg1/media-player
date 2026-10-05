import { useRouter } from 'expo-router';
import type { SeriesInfo } from 'expo-m3u-parser';
import { useCallback, useMemo, useState } from 'react';

import { useReportLandingReady } from '@/features/launch/use-report-landing-ready';
import { useFavoriteChannels } from '@/features/live/hooks/use-favorite-channels';
import { useFavoriteGroups } from '@/features/live/hooks/use-favorite-groups';
import { useGroups } from '@/features/live/hooks/use-groups';
import { usePaginatedChannels } from '@/features/live/hooks/use-paginated-channels';
import { usePlaylistData } from '@/features/live/hooks/use-playlist-data';
import { usePaginatedSeries } from '@/features/videos/hooks/use-paginated-series';
import { VideosScreenContent } from '@/features/videos/videos-screen-content';
import { useThemeColor } from '@/hooks/use-theme-color';
import { FAVORITES_GROUP_SENTINEL, getEffectiveFavoriteGroups } from '@/lib/group-utils';
import { movieHref, seriesHref } from '@/lib/detail-hrefs';
import { useFirstPageCacheStore } from '@/stores/cache';
import { selectExcludeAdult, useUserStore } from '@/stores/user/user-store';
import { MOVIE_SORT_OPTIONS, SERIES_SORT_OPTIONS } from '@/types/sort.types';
import type { Channel } from '@/types/playlist.types';

export default function VideosScreen() {
  const router = useRouter();

  const backgroundColor = useThemeColor({}, 'background');

  // Parental control: exclude adult content when enabled
  const excludeAdult = useUserStore((s) => selectExcludeAdult(s.currentUser));

  // Content type toggle state
  const [contentType, setContentType] = useState<'movie' | 'series'>('movie');

  // Filter state managed locally, passed to paginated hook
  const [userGroupSelection, setUserGroupSelection] = useState<string | null>(null);
  const [searchText, setSearchText] = useState<string>('');
  const [movieSortId, setMovieSortId] = useState('alphabetical');
  const [movieSortOrder, setMovieSortOrder] = useState<'asc' | 'desc'>('asc');
  const [seriesSortId, setSeriesSortId] = useState('alphabetical');
  const [seriesSortOrder, setSeriesSortOrder] = useState<'asc' | 'desc'>('asc');

  // Custom hooks for data management
  const { activePlaylist, hasLoadedPlaylist } = usePlaylistData();
  const {
    favoriteChannels,
    hasLoadedFavorites,
    isRefreshing,
    handleRefresh
  } = useFavoriteChannels(activePlaylist, hasLoadedPlaylist);

  // Favorite groups (single source of truth — passed down to the grid via props)
  const { favoriteGroups, isLoading: isLoadingFavoriteGroups, toggleFavorite: toggleFavoriteGroup } = useFavoriteGroups();

  // Server-side groups fetching (with favorites support)
  const {
    groups,
    isLoading: isLoadingGroups,
    error: groupsError,
    retry: retryGroups,
  } = useGroups(activePlaylist?.id, contentType, favoriteGroups, excludeAdult);

  // One set for the whole screen: the grid checks it once per visible cell, and
  // the store hands out a fresh favorites array on every focus.
  const favoriteChannelIdSet = useMemo(() => new Set(favoriteChannels), [favoriteChannels]);

  // Synchronous state derivation: reset filters on playlist/content type change
  // (avoids useEffect timing issues where stale groups reach hooks before reset)
  const activePlaylistId = activePlaylist?.id;
  const [prevActivePlaylistId, setPrevActivePlaylistId] = useState(activePlaylistId);
  const [prevContentType, setPrevContentType] = useState(contentType);

  if (activePlaylistId !== prevActivePlaylistId) {
    setPrevActivePlaylistId(activePlaylistId);
    setUserGroupSelection(null);
    setSearchText('');
    setMovieSortId('alphabetical');
    setMovieSortOrder('asc');
    setSeriesSortId('alphabetical');
    setSeriesSortOrder('asc');
  }

  if (contentType !== prevContentType) {
    setPrevContentType(contentType);
    setUserGroupSelection(null);
    setSearchText('');
  }

  // The favorite groups that actually exist for this content type. An empty array
  // is a filter that matches nothing — as opposed to `undefined`, which means "no
  // group filter" — so it must never be turned back into "show everything".
  const effectiveFavoriteGroups = useMemo(
    () => getEffectiveFavoriteGroups(favoriteGroups, groups),
    [favoriteGroups, groups],
  );

  // Derive selectedGroupName: user selection takes priority, otherwise default to
  // favorites — but only once they are known to match a group here. Defaulting to
  // the sentinel on a playlist whose movies live in other groups would label the
  // unfiltered catalogue "Favorites".
  const selectedGroupName = userGroupSelection !== null
    ? userGroupSelection
    : effectiveFavoriteGroups.length > 0
      ? FAVORITES_GROUP_SENTINEL
      : '';

  // Both the default filter above and the sentinel translation below are derived
  // from the groups, so the first query waits for them instead of fetching the
  // whole catalogue and immediately re-fetching. A *failed* group fetch resolves
  // too (with no groups), so this can never pin the skeleton.
  const shouldDeferFetch = !hasLoadedFavorites || isLoadingFavoriteGroups || isLoadingGroups;

  // Translate FAVORITES_GROUP_SENTINEL for the paginated queries
  const contentGroups = selectedGroupName === FAVORITES_GROUP_SENTINEL
    ? effectiveFavoriteGroups
    : selectedGroupName
      ? [selectedGroupName]
      : undefined;
  const hasUnmatchedFavoriteGroups = contentGroups?.length === 0;

  // Derive active sort options based on content type
  const isSeries = contentType === 'series';
  const activeSortOptions = isSeries ? SERIES_SORT_OPTIONS : MOVIE_SORT_OPTIONS;
  const selectedSortId = isSeries ? seriesSortId : movieSortId;
  const activeSortOrder = isSeries ? seriesSortOrder : movieSortOrder;
  const activeSortOption = useMemo(
    () => activeSortOptions.find((o) => o.id === selectedSortId) ?? activeSortOptions[0],
    [activeSortOptions, selectedSortId],
  );

  // Both content types stay mounted with the real playlist id and are held back
  // with `deferNetworkFetch`: dropping the playlist id for the inactive one
  // restarted its query from scratch on every toggle.
  const {
    channels,
    isLoading: isLoadingChannels,
    isLoadingMore: isLoadingMoreChannels,
    isRefreshing: isRefreshingChannels,
    hasMore: hasMoreChannels,
    loadMore: loadMoreChannels,
    error: channelsError,
    refresh: refreshChannels,
    retry: retryChannels,
  } = usePaginatedChannels({
    playlistId: activePlaylist?.id,
    groups: contentGroups,
    search: searchText,
    contentType: 'movie',
    favoriteChannelIds: favoriteChannels,
    excludeAdult,
    sortBy: activeSortOption.sortBy,
    sortOrder: activeSortOrder,
    deferNetworkFetch: shouldDeferFetch || isSeries,
  });

  const {
    series: seriesList,
    isLoading: isLoadingSeries,
    isLoadingMore: isLoadingMoreSeries,
    isRefreshing: isRefreshingSeries,
    hasMore: hasMoreSeries,
    loadMore: loadMoreSeries,
    error: seriesError,
    refresh: refreshSeries,
    retry: retrySeries,
  } = usePaginatedSeries({
    playlistId: activePlaylist?.id,
    groups: contentGroups,
    search: searchText,
    excludeAdult,
    favoriteChannelIds: favoriteChannels,
    sortOrder: activeSortOrder,
    deferNetworkFetch: shouldDeferFetch || !isSeries,
  });

  // Populated enough to be worth revealing at launch. Movies are what the tab
  // opens on, and their first page is normally pre-fetched, so this is true on
  // the first render and the splash never waits for this tab at all.
  useReportLandingReady('videos', channels.length > 0 || !isLoadingChannels);

  // Event handlers for filters
  const handleGroupSelect = useCallback((groupName: string) => {
    setUserGroupSelection(groupName);
  }, []);

  const handleSearchTextChange = useCallback((text: string) => {
    setSearchText(text);
  }, []);

  const handleContentTypeChange = useCallback((type: 'movie' | 'series') => {
    setContentType(type);
  }, []);

  const handleSortSelect = useCallback((id: string) => {
    const currentId = isSeries ? seriesSortId : movieSortId;
    const setId = isSeries ? setSeriesSortId : setMovieSortId;
    const setOrder = isSeries ? setSeriesSortOrder : setMovieSortOrder;
    const options = isSeries ? SERIES_SORT_OPTIONS : MOVIE_SORT_OPTIONS;

    if (id === currentId) {
      setOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      const option = options.find((o) => o.id === id);
      setId(id);
      setOrder(option?.defaultOrder ?? 'asc');
    }
  }, [isSeries, seriesSortId, movieSortId]);

  // Opening a title is a navigation, not screen state: the detail route keeps
  // the grid mounted behind it and stays in history, so the player it launches
  // comes back to the title rather than to the grid.
  const handleMoviePress = useCallback((channel: Channel) => {
    router.push(movieHref(activePlaylist?.id ?? '', channel));
  }, [router, activePlaylist?.id]);

  const handleSeriesPress = useCallback((series: SeriesInfo) => {
    router.push(seriesHref(activePlaylist?.id ?? '', series));
  }, [router, activePlaylist?.id]);

  // Determine loading/pagination state based on content type. A revalidation of
  // already-rendered items is not a reason to tear the grid down for a skeleton.
  const items = isSeries ? seriesList : channels;
  const isLoadingItems = isSeries ? isLoadingSeries : isLoadingChannels;
  const isLoadingMore = isSeries ? isLoadingMoreSeries : isLoadingMoreChannels;
  const hasMore = isSeries ? hasMoreSeries : hasMoreChannels;
  const loadMore = isSeries ? loadMoreSeries : loadMoreChannels;
  const retryContent = isSeries ? retrySeries : retryChannels;

  // Groups and content fail independently; either failure must surface.
  const contentError = isSeries ? seriesError : channelsError;
  const loadError = contentError ?? groupsError;

  // Whichever query failed is the one to re-run; the group fetch has its own
  // retry, and neither knows about the other.
  const retry = useCallback(() => {
    if (groupsError) retryGroups();
    if (contentError || !groupsError) retryContent();
  }, [groupsError, contentError, retryGroups, retryContent]);

  // A failure is never shown as loading: the skeleton would hide the error and
  // the retry it carries.
  const isLoading = !loadError
    && (!hasLoadedPlaylist
      || (!!activePlaylist && (shouldDeferFetch || (isLoadingItems && items.length === 0))));

  // Combined refresh handler
  const handleCombinedRefresh = useCallback(() => {
    if (activePlaylist?.id) {
      useFirstPageCacheStore.getState().invalidatePlaylist(activePlaylist.id);
    }
    handleRefresh();
    if (isSeries) {
      refreshSeries();
    } else {
      refreshChannels();
    }
  }, [handleRefresh, refreshChannels, refreshSeries, isSeries, activePlaylist?.id]);

  // The pull-to-refresh spinner has to cover the content re-fetch as well, not
  // just the favorites reload.
  const isRefreshingAll =
    isRefreshing || (isSeries ? isRefreshingSeries : isRefreshingChannels);

  return (
    <VideosScreenContent
      contentType={contentType}
      onContentTypeChange={handleContentTypeChange}
      isLoading={isLoading}
      playlist={activePlaylist}
      channels={channels}
      favoriteChannels={favoriteChannelIdSet}
      groups={groups}
      selectedGroup={selectedGroupName}
      searchText={searchText}
      isRefreshing={isRefreshingAll}
      error={loadError}
      onRetry={retry}
      hasUnmatchedFavoriteGroups={hasUnmatchedFavoriteGroups}
      onGroupSelect={handleGroupSelect}
      onSearchChange={handleSearchTextChange}
      onChannelPress={handleMoviePress}
      onRefresh={handleCombinedRefresh}
      onLoadMore={loadMore}
      isLoadingMore={isLoadingMore}
      hasMore={hasMore}
      backgroundColor={backgroundColor}
      favoriteGroups={favoriteGroups}
      onToggleFavoriteGroup={toggleFavoriteGroup}
      seriesList={seriesList}
      onSeriesPress={handleSeriesPress}
      sortOptions={activeSortOptions}
      selectedSortId={selectedSortId}
      sortOrder={activeSortOrder}
      onSortSelect={handleSortSelect}
    />
  );
}
