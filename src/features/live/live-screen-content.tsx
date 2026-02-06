import { ChannelItem } from '@/features/live/channel-item';
import { LiveEmptyState } from '@/features/live/live-empty-state';
import { LiveLoadingSpinner } from '@/features/live/live-loading-spinner';
import { LiveTopBar } from '@/features/live/live-top-bar';
import InfiniteParallaxGrid from '@/components/ui/containers/infinite-parallax-grid';
import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { isChannelFavorite } from '@/lib/channel-utils';
import type { GroupOption } from '@/lib/group-utils';
import type { Channel, Playlist } from '@/types/playlist.types';
import type { ListRenderItemInfo } from '@shopify/flash-list';
import { useCallback, useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

interface LiveScreenContentProps {
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
}

export function LiveScreenContent({
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
}: LiveScreenContentProps) {
  const keyExtractor = useCallback((item: Channel, index: number) => {
    return `channel-${item.name}-${index}`;
  }, []);

  const renderChannelItem = useCallback(({ item: channel }: ListRenderItemInfo<Channel>) => {
    const isFavorite = isChannelFavorite(channel, favoriteChannels);

    return (
      <ChannelItem
        channel={channel}
        isFavorite={isFavorite}
        onPress={onChannelPress}
      />
    );
  }, [favoriteChannels, onChannelPress]);

  const EmptyComponent = useCallback(() => {
    return (
      <LiveEmptyState
        searchText={searchText}
        selectedGroupName={selectedGroup}
        iconColor={iconColor}
      />
    );
  }, [searchText, selectedGroup, iconColor]);

  const LoadingComponent = useCallback(() => {
    return (
      <LiveLoadingSpinner
        isLoading={isLoading}
        tintColor={tintColor}
      />
    );
  }, [isLoading, tintColor]);

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
            <IconSymbol
              size={310}
              color="#808080"
              name="play.tv"
              style={styles.headerImage}
            />
          }
          ListHeaderComponentAfterParallax={
            <ThemedView style={[styles.contentContainer, styles.gridBackground]}>
              <LiveTopBar
                groups={groups}
                selectedGroupName={selectedGroup}
                onGroupSelect={onGroupSelect}
                searchText={searchText}
                onSearchTextChange={onSearchChange}
                favoriteGroups={favoriteGroups}
                onToggleFavoriteGroup={onToggleFavoriteGroup}
              />
            </ThemedView>
          }
          columns={4}
          ListEmptyComponent={<LoadingComponent />}
          refreshing={isRefreshing}
          onRefresh={onRefresh}
        />
      </View>
    );
  }

  // Show no playlist message only when we've confirmed there's no playlist
  if (!playlist) {
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

  // Show channels with full functionality
  return (
    <View style={[styles.container, { backgroundColor }]}>
      <InfiniteParallaxGrid
        data={channels}
        renderItem={renderChannelItem}
        keyExtractor={keyExtractor}
        headerBackgroundColor={{ light: '#D0D0D0', dark: '#353636' }}
        headerImage={
          <IconSymbol
            size={310}
            color="#808080"
            name="play.tv"
            style={styles.headerImage}
          />
        }
        ListHeaderComponentAfterParallax={
          <ThemedView style={[styles.contentContainer, styles.gridBackground]}>
              <LiveTopBar
                groups={groups}
                selectedGroupName={selectedGroup}
                onGroupSelect={onGroupSelect}
                searchText={searchText}
                onSearchTextChange={onSearchChange}
                favoriteGroups={favoriteGroups}
                onToggleFavoriteGroup={onToggleFavoriteGroup}
              />
          </ThemedView>
        }
        columns={4}
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
    color: '#808080',
    bottom: -90,
    left: -35,
    position: 'absolute',
  },
  contentContainer: {
    paddingHorizontal: 0,
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