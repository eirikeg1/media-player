import InfiniteParallaxGrid from '@/components/ui/containers/infinite-parallax-grid';
import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { SkeletonGrid } from '@/components/ui/display/skeleton-grid';
import { MovieItem } from '@/features/videos/movie-item';
import { SeriesItem } from '@/features/videos/series-item';
import { VideosEmptyState } from '@/features/videos/videos-empty-state';
import { VideosTopBar } from '@/features/videos/videos-top-bar';
import { isChannelFavorite, isSeriesFavorite } from '@/lib/channel-utils';
import { useHeaderBackground } from '@/hooks/use-header-background';
import type { GroupOption } from '@/lib/group-utils';
import type { SortOption } from '@/types/sort.types';
import type { Channel, Playlist } from '@/types/playlist.types';
import type { ListRenderItemInfo } from '@shopify/flash-list';
import { Image } from 'expo-image';
import type { SeriesInfo } from 'expo-m3u-parser';
import { useCallback, useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

const DEFAULT_VIDEOS_HEADER = require('../../../assets/images/parallax-headers/general/green-paper-cut-abstract.jpg');

interface VideosScreenContentProps {
  contentType: 'movie' | 'series';
  onContentTypeChange: (type: 'movie' | 'series') => void;
  isLoading: boolean;
  playlist: Playlist | null;
  channels: Channel[];
  favoriteChannels: string[];
  groups: GroupOption[];
  selectedGroup: string;
  searchText: string;
  isRefreshing: boolean;
  onGroupSelect: (group: string) => void;
  onSearchChange: (text: string) => void;
  onChannelPress: (channel: Channel) => void;
  onRefresh: () => void;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  hasMore?: boolean;
  backgroundColor: string;
  iconColor: string;
  tintColor: string;
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
  onGroupSelect,
  onSearchChange,
  onChannelPress,
  onRefresh,
  onLoadMore,
  isLoadingMore = false,
  hasMore = true,
  backgroundColor,
  iconColor,
  tintColor,
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

  const channelKeyExtractor = useCallback((item: Channel, index: number) => {
    return `channel-${item.name}-${index}`;
  }, []);

  const seriesKeyExtractor = useCallback((item: SeriesInfo, index: number) => {
    return `series-${item.seriesName}-${index}`;
  }, []);

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

  const EmptyComponent = useCallback(() => {
    return (
      <VideosEmptyState
        searchText={searchText}
        selectedGroupName={selectedGroup}
        iconColor={iconColor}
        contentType={contentType}
      />
    );
  }, [searchText, selectedGroup, iconColor, contentType]);

  // Loading more indicator for pagination
  const LoadingMoreComponent = useMemo(() => {
    if (!isLoadingMore) return undefined;
    return (
      <View style={styles.loadingMoreContainer}>
        <ActivityIndicator size="small" color={tintColor} />
      </View>
    );
  }, [isLoadingMore, tintColor]);

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
            data={[] as SeriesInfo[]}
            renderItem={renderSeriesItem}
            keyExtractor={seriesKeyExtractor}
            {...gridProps}
            ListEmptyComponent={<SkeletonGrid variant="series" />}
          />
        ) : (
          <InfiniteParallaxGrid
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
        <ThemedView style={styles.emptyContainer}>
          <IconSymbol name="film.fill" size={64} color={iconColor} />
          <ThemedText style={styles.emptyTitle}>
            No Active Playlist
          </ThemedText>
          <ThemedText style={styles.emptyText} type="subtitle">
            Please add and select a playlist from the settings
          </ThemedText>
        </ThemedView>
      </View>
    );
  }

  // Show content with full functionality
  if (isSeries) {
    return (
      <View style={[styles.container, { backgroundColor }]}>
        <InfiniteParallaxGrid
          data={seriesList ?? []}
          renderItem={renderSeriesItem}
          keyExtractor={seriesKeyExtractor}
          {...gridProps}
          ListEmptyComponent={<EmptyComponent />}
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
        data={channels}
        renderItem={renderChannelItem}
        keyExtractor={channelKeyExtractor}
        {...gridProps}
        ListEmptyComponent={<EmptyComponent />}
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    minHeight: 200,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  loadingMoreContainer: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
