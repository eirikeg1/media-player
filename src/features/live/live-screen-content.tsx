import { ChannelItem } from '@/features/live/channel-item';
import { LiveEmptyState } from '@/features/live/live-empty-state';
import { SkeletonGrid } from '@/components/ui/display/skeleton-grid';
import { LiveTopBar, type LiveViewMode } from '@/features/live/live-top-bar';
import { EpgGuide } from '@/features/live/guide/epg-guide';
import InfiniteParallaxGrid from '@/components/ui/containers/infinite-parallax-grid';
import { Image } from 'expo-image';
import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { getRawChannelId, isChannelFavorite } from '@/lib/channel-utils';
import { useHeaderBackground } from '@/hooks/use-header-background';
import type { GroupOption } from '@/lib/group-utils';
import type { SortOption } from '@/types/sort.types';
import type { EpgProgramme } from 'expo-m3u-parser';
import type { Channel, Playlist } from '@/types/playlist.types';
import type { ListRenderItemInfo } from '@shopify/flash-list';
import { useCallback, useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

const DEFAULT_LIVE_HEADER = require('../../../assets/images/parallax-headers/live/header-champions-league.jpg');

interface LiveScreenContentProps {
  viewMode: LiveViewMode;
  onViewModeChange: (mode: LiveViewMode) => void;
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
  sortOptions: SortOption[];
  selectedSortId: string;
  sortOrder: 'asc' | 'desc';
  onSortSelect: (id: string) => void;
  currentProgrammes?: Map<string, EpgProgramme>;
  excludeAdult: boolean;
}

export function LiveScreenContent({
  viewMode,
  onViewModeChange,
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
  sortOptions,
  selectedSortId,
  sortOrder,
  onSortSelect,
  currentProgrammes,
  excludeAdult,
}: LiveScreenContentProps) {
  const customHeader = useHeaderBackground('live');

  const keyExtractor = useCallback((item: Channel, index: number) => {
    return `channel-${item.name}-${index}`;
  }, []);

  const renderChannelItem = useCallback(({ item: channel }: ListRenderItemInfo<Channel>) => {
    const isFavorite = isChannelFavorite(channel, favoriteChannels);
    const programme = currentProgrammes?.get(channel.tvg?.id ?? '') ?? null;

    return (
      <ChannelItem
        testID={`channel-item-${getRawChannelId(channel)}`}
        channel={channel}
        isFavorite={isFavorite}
        onPress={onChannelPress}
        currentProgramme={programme}
      />
    );
  }, [favoriteChannels, onChannelPress, currentProgrammes]);

  const EmptyComponent = useCallback(() => {
    return (
      <LiveEmptyState
        searchText={searchText}
        selectedGroupName={selectedGroup}
        iconColor={iconColor}
      />
    );
  }, [searchText, selectedGroup, iconColor]);

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

  const topBarComponent = (
    <ThemedView style={[styles.contentContainer, styles.gridBackground]}>
      <LiveTopBar
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
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

  // Show no playlist message only when we've confirmed there's no playlist
  if (!isLoading && !playlist) {
    return (
      <View style={[styles.container, { backgroundColor }]}>
        <ThemedView style={styles.emptyContainer}>
          <IconSymbol name="tv" size={64} color={iconColor} />
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

  // Guide mode — render EPG guide instead of channel grid
  if (viewMode === 'guide') {
    return (
      <View style={[styles.container, { backgroundColor }]}>
        <InfiniteParallaxGrid
          data={[]}
          renderItem={renderChannelItem}
          keyExtractor={keyExtractor}
          headerBackgroundColor={{ light: '#D0D0D0', dark: '#353636' }}
          headerImage={
            <Image
              source={customHeader ?? DEFAULT_LIVE_HEADER}
              style={styles.headerImage}
              contentFit="cover"
            />
          }
          ListHeaderComponentAfterParallax={topBarComponent}
          columns={4}
          padding={5}
          gap={4}
          ListEmptyComponent={
            <EpgGuide
              playlistId={playlist?.id}
              favoriteChannels={favoriteChannels}
              favoriteGroups={favoriteGroups}
              excludeAdult={excludeAdult}
              onChannelPress={onChannelPress}
              onToggleFavoriteGroup={onToggleFavoriteGroup}
            />
          }
          refreshing={isRefreshing}
          onRefresh={onRefresh}
        />
      </View>
    );
  }

  // Show loading spinner if data hasn't loaded yet
  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor }]}>
        <InfiniteParallaxGrid
          data={[]}
          renderItem={renderChannelItem}
          keyExtractor={keyExtractor}
          headerBackgroundColor={{ light: '#D0D0D0', dark: '#353636' }}
          headerImage={
            <Image
              source={customHeader ?? DEFAULT_LIVE_HEADER}
              style={styles.headerImage}
              contentFit="cover"
            />
          }
          ListHeaderComponentAfterParallax={topBarComponent}
          columns={4}
          padding={5}
          gap={4}
          ListEmptyComponent={<SkeletonGrid variant="channel" />}
          refreshing={isRefreshing}
          onRefresh={onRefresh}
        />
      </View>
    );
  }

  // Show channels with full functionality
  return (
    <View style={[styles.container, { backgroundColor }]}>
      <InfiniteParallaxGrid
        data={channels}
        renderItem={renderChannelItem}
        keyExtractor={keyExtractor}
        headerBackgroundColor={{ light: '#D0D0D0', dark: '#353636' }}
        headerImage={
          <Image
            source={customHeader ?? DEFAULT_LIVE_HEADER}
            style={styles.headerImage}
            contentFit="cover"
          />
        }
        ListHeaderComponentAfterParallax={topBarComponent}
        columns={4}
        padding={5}
        gap={4}
        ListEmptyComponent={<EmptyComponent />}
        ListFooterComponent={LoadingMoreComponent}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        refreshing={isRefreshing}
        onRefresh={onRefresh}
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
