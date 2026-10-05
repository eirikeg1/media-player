import InfiniteParallaxGrid from '@/components/ui/containers/infinite-parallax-grid';
import { ThemedView } from '@/components/ui/display/themed-view';
import { SkeletonGrid } from '@/components/ui/display/skeleton-grid';
import { EmptyState, Spinner } from '@/components/ui/display/state';
import { MovieItem } from '@/features/videos/movie-item';
import { SeriesItem } from '@/features/videos/series-item';
import { VideosEmptyState } from '@/features/videos/videos-empty-state';
import { VideosTopBar } from '@/features/videos/videos-top-bar';
import {
  getChannelId,
  getSeriesId,
  isChannelFavorite,
  isSeriesFavorite,
  type FavoriteIds,
} from '@/lib/channel-utils';
import { useHeaderBackground } from '@/hooks/use-header-background';
import type { GroupOption } from '@/lib/group-utils';
import type { SortOption } from '@/types/sort.types';
import type { Channel, Playlist } from '@/types/playlist.types';
import type { ListRenderItemInfo } from '@shopify/flash-list';
import { Image } from 'expo-image';
import type { SeriesInfo } from 'expo-m3u-parser';
import { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

const DEFAULT_VIDEOS_HEADER = require('../../../assets/images/parallax-headers/general/green-paper-cut-abstract.jpg');

interface VideosScreenContentProps {
  contentType: 'movie' | 'series';
  onContentTypeChange: (type: 'movie' | 'series') => void;
  isLoading: boolean;
  playlist: Playlist | null;
  channels: Channel[];
  /** Favorite ids as a set, so the grid can check every visible cell in O(1). */
  favoriteChannels: FavoriteIds;
  groups: GroupOption[];
  selectedGroup: string;
  searchText: string;
  isRefreshing: boolean;
  /** Message from a failed content or group query, if any. */
  error?: string | null;
  onRetry?: () => void;
  /** Favorites filter is on, but none of the favorite groups exist here. */
  hasUnmatchedFavoriteGroups?: boolean;
  onGroupSelect: (group: string) => void;
  onSearchChange: (text: string) => void;
  onChannelPress: (channel: Channel) => void;
  onRefresh: () => void;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  hasMore?: boolean;
  backgroundColor: string;
  favoriteGroups: string[];
  onToggleFavoriteGroup: (name: string) => void;
  seriesList?: SeriesInfo[];
  onSeriesPress?: (series: SeriesInfo) => void;
  sortOptions: SortOption[];
  selectedSortId: string;
  sortOrder: 'asc' | 'desc';
  onSortSelect: (id: string) => void;
}

export function VideosScreenContent({
  contentType,
  onContentTypeChange,
  isLoading,
  playlist,
  channels,
  favoriteChannels,
  groups,
  selectedGroup,
  searchText,
  isRefreshing,
  error,
  onRetry,
  hasUnmatchedFavoriteGroups,
  onGroupSelect,
  onSearchChange,
  onChannelPress,
  onRefresh,
  onLoadMore,
  isLoadingMore = false,
  hasMore = true,
  backgroundColor,
  favoriteGroups,
  onToggleFavoriteGroup,
  seriesList,
  onSeriesPress,
  sortOptions,
  selectedSortId,
  sortOrder,
  onSortSelect,
}: VideosScreenContentProps) {
  const isSeries = contentType === 'series';
  const customMoviesHeader = useHeaderBackground('movies');
  const customSeriesHeader = useHeaderBackground('series');

  // Stable identities, not list positions: an index-based key re-binds every
  // cell to a different item as soon as a page is appended or re-ordered.
  const channelKeyExtractor = useCallback((item: Channel) => getChannelId(item), []);

  const seriesKeyExtractor = useCallback((item: SeriesInfo) => getSeriesId(item), []);

  const renderChannelItem = useCallback(({ item: channel }: ListRenderItemInfo<Channel>) => {
    const isFavorite = isChannelFavorite(channel, favoriteChannels);

    return (
      <MovieItem
        channel={channel}
        isFavorite={isFavorite}
        onPress={onChannelPress}
      />
    );
  }, [favoriteChannels, onChannelPress]);

  const renderSeriesItem = useCallback(({ item: series }: ListRenderItemInfo<SeriesInfo>) => {
    if (!onSeriesPress) return null;
    const isFavorite = isSeriesFavorite(series, favoriteChannels);

    return (
      <SeriesItem
        series={series}
        isFavorite={isFavorite}
        onPress={onSeriesPress}
      />
    );
  }, [favoriteChannels, onSeriesPress]);

  // An element, not a component type: FlashList remounts the latter on every
  // render, throwing away the empty state's own state each time.
  const emptyComponent = useMemo(
    () => (
      <VideosEmptyState
        searchText={searchText}
        selectedGroupName={selectedGroup}
        hasUnmatchedFavoriteGroups={hasUnmatchedFavoriteGroups}
        error={error}
        onRetry={onRetry}
        contentType={contentType}
      />
    ),
    [searchText, selectedGroup, hasUnmatchedFavoriteGroups, error, onRetry, contentType]
  );

  // Loading more indicator for pagination
  const LoadingMoreComponent = useMemo(() => {
    if (!isLoadingMore) return undefined;
    return (
      <View style={styles.loadingMoreContainer}>
        <Spinner />
      </View>
    );
  }, [isLoadingMore]);

  // Handler for end reached - only trigger if we have more to load and not already loading
  const handleEndReached = useCallback(() => {
    if (hasMore && !isLoadingMore && onLoadMore) {
      onLoadMore();
    }
  }, [hasMore, isLoadingMore, onLoadMore]);

  const topBar = (
    <ThemedView style={[styles.contentContainer, styles.gridBackground]}>
      <VideosTopBar
        contentType={contentType}
        onContentTypeChange={onContentTypeChange}
        groups={groups}
        selectedGroupName={selectedGroup}
        onGroupSelect={onGroupSelect}
        searchText={searchText}
        onSearchTextChange={onSearchChange}
        favoriteGroups={favoriteGroups}
        onToggleFavoriteGroup={onToggleFavoriteGroup}
        sortOptions={sortOptions}
        selectedSortId={selectedSortId}
        sortOrder={sortOrder}
        onSortSelect={onSortSelect}
      />
    </ThemedView>
  );

  const headerImageSource = isSeries
    ? (customSeriesHeader ?? DEFAULT_VIDEOS_HEADER)
    : (customMoviesHeader ?? DEFAULT_VIDEOS_HEADER);

  const headerImage = (
    <Image
      source={headerImageSource}
      style={styles.headerImage}
      contentFit="cover"
    />
  );

  // Shared by every branch below. Each grid also carries `key={contentType}`:
  // movies and series render at the same position in the tree, so without it the
  // series list inherits the movie list's recycled cells and scroll offset.
  const gridProps = {
    headerBackgroundColor: { light: '#D0D0D0' as const, dark: '#353636' as const },
    headerImage,
    ListHeaderComponentAfterParallax: topBar,
    columns: 4,
    padding: 5,
    refreshing: isRefreshing,
    onRefresh,
  };

  // Show skeleton loading if data hasn't loaded yet
  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor }]}>
        {isSeries ? (
          <InfiniteParallaxGrid
            key={contentType}
            data={[] as SeriesInfo[]}
            renderItem={renderSeriesItem}
            keyExtractor={seriesKeyExtractor}
            {...gridProps}
            ListEmptyComponent={<SkeletonGrid variant="series" />}
          />
        ) : (
          <InfiniteParallaxGrid
            key={contentType}
            data={[] as Channel[]}
            renderItem={renderChannelItem}
            keyExtractor={channelKeyExtractor}
            {...gridProps}
            ListEmptyComponent={<SkeletonGrid variant="movie" />}
          />
        )}
      </View>
    );
  }

  // Show no playlist message only when we've confirmed there's no playlist
  if (!playlist) {
    return (
      <View style={[styles.container, { backgroundColor }]}>
        <EmptyState
          icon="film.fill"
          title="No Active Playlist"
          message="Please add and select a playlist from the settings"
          safeArea
        />
      </View>
    );
  }

  // Show content with full functionality
  if (isSeries) {
    return (
      <View style={[styles.container, { backgroundColor }]}>
        <InfiniteParallaxGrid
          key={contentType}
          data={seriesList ?? []}
          renderItem={renderSeriesItem}
          keyExtractor={seriesKeyExtractor}
          {...gridProps}
          ListEmptyComponent={emptyComponent}
          ListFooterComponent={LoadingMoreComponent}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.5}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <InfiniteParallaxGrid
        key={contentType}
        data={channels}
        renderItem={renderChannelItem}
        keyExtractor={channelKeyExtractor}
        {...gridProps}
        ListEmptyComponent={emptyComponent}
        ListFooterComponent={LoadingMoreComponent}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerImage: {
    width: '100%',
    height: '100%',
  },
  contentContainer: {
    paddingHorizontal: 5,
  },
  gridBackground: {
    flex: 1,
    minHeight: '100%',
  },
  loadingMoreContainer: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
