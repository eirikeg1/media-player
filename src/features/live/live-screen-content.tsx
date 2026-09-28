import { ChannelItem } from '@/features/live/channel-item';
import { SkeletonGrid } from '@/components/ui/display/skeleton-grid';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/display/state';
import { LiveTopBar, type LiveViewMode } from '@/features/live/live-top-bar';
import { EpgGuide } from '@/features/live/guide/epg-guide';
import InfiniteParallaxGrid from '@/components/ui/containers/infinite-parallax-grid';
import { Image } from 'expo-image';
import { ThemedView } from '@/components/ui/display/themed-view';
import { getChannelId, getRawChannelId } from '@/lib/channel-utils';
import { useChromeInsets } from '@/hooks/use-chrome-insets';
import { useHeaderBackground } from '@/hooks/use-header-background';
import { FAVORITES_GROUP_SENTINEL, type GroupOption } from '@/lib/group-utils';
import type { SortOption } from '@/types/sort.types';
import type { EpgProgramme } from 'expo-m3u-parser';
import type { Channel, Playlist } from '@/types/playlist.types';
import type { ListRenderItemInfo } from '@shopify/flash-list';
import { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const DEFAULT_LIVE_HEADER = require('../../../assets/images/parallax-headers/live/header-champions-league.jpg');

/** Human-readable label for a group filter — never the raw sentinel string. */
function groupLabel(selectedGroupName: string): string {
  return selectedGroupName === FAVORITES_GROUP_SENTINEL ? 'Favorite Groups' : selectedGroupName;
}

/** Why the channel list came back empty, in the user's terms. */
function noChannelsMessage(
  searchText: string,
  selectedGroupName: string,
  hasUnmatchedFavoriteGroups: boolean
): string {
  if (searchText.trim().length > 0) return `No channels found for "${searchText}"`;
  if (hasUnmatchedFavoriteGroups) return 'None of your favorite groups are in this playlist';
  if (selectedGroupName) return `No channels found in "${groupLabel(selectedGroupName)}"`;
  return "This playlist doesn't contain any channels";
}

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
  /** Message from a failed channel or group query, if any. */
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
  sortOptions,
  selectedSortId,
  sortOrder,
  onSortSelect,
  currentProgrammes,
  excludeAdult,
}: LiveScreenContentProps) {
  const customHeader = useHeaderBackground('live');
  const insets = useSafeAreaInsets();
  const chromeInsets = useChromeInsets();

  const keyExtractor = useCallback((item: Channel) => getChannelId(item), []);

  const renderChannelItem = useCallback(({ item: channel }: ListRenderItemInfo<Channel>) => {
    const programme = currentProgrammes?.get(channel.tvg?.id ?? '') ?? null;

    return (
      <ChannelItem
        testID={`channel-item-${getRawChannelId(channel)}`}
        channel={channel}
        onPress={onChannelPress}
        currentProgramme={programme}
      />
    );
  }, [onChannelPress, currentProgrammes]);

  // An element, not a component type: FlashList remounts the latter on every
  // render, throwing away the empty state's own state each time.
  const emptyComponent = useMemo(() => {
    // A failure must never read as "this playlist has no channels".
    if (error) {
      return <ErrorState title="Couldn't Load Channels" message={error} onRetry={onRetry} />;
    }

    const isSearching = searchText.trim().length > 0;
    return (
      <EmptyState
        icon={isSearching ? 'magnifyingglass' : 'tv'}
        title={isSearching ? 'No Results' : 'No Channels'}
        message={noChannelsMessage(
          searchText,
          selectedGroup,
          hasUnmatchedFavoriteGroups ?? false
        )}
      />
    );
  }, [searchText, selectedGroup, hasUnmatchedFavoriteGroups, error, onRetry]);

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

  const liveTopBar = (
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
  );

  // Inside the parallax list the bar has to stretch so its background covers the
  // gap left by the header spacer; as a plain sibling it must not.
  const topBarComponent = (
    <ThemedView style={[styles.contentContainer, styles.gridBackground]}>{liveTopBar}</ThemedView>
  );

  // Show no playlist message only when we've confirmed there's no playlist
  if (!isLoading && !playlist) {
    return (
      <View style={[styles.container, { backgroundColor }]}>
        <EmptyState
          icon="tv"
          title="No Active Playlist"
          message="Please add and select a playlist from the settings"
          safeArea
        />
      </View>
    );
  }

  // Guide mode — a fixed two-axis grid that has to own its own scrolling, so it
  // is a full-height sibling of the top bar rather than a cell inside the
  // parallax list (which nested two scrollers and capped the guide at 400px).
  if (viewMode === 'guide') {
    return (
      <View
        style={[
          styles.container,
          { backgroundColor, paddingTop: insets.top, paddingBottom: chromeInsets.bottom },
        ]}
      >
        <ThemedView style={styles.contentContainer}>{liveTopBar}</ThemedView>
        <EpgGuide
          playlistId={playlist?.id}
          favoriteChannels={favoriteChannels}
          favoriteGroups={favoriteGroups}
          groups={groups}
          excludeAdult={excludeAdult}
          onChannelPress={onChannelPress}
          onToggleFavoriteGroup={onToggleFavoriteGroup}
          onRefresh={onRefresh}
          isRefreshing={isRefreshing}
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
        ListEmptyComponent={emptyComponent}
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
  loadingMoreContainer: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
