import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';
import { isEpgSearchActive, useEpgSearch } from '@/features/live/hooks/use-epg-search';
import { useGuideProgrammes } from '@/features/live/hooks/use-guide-programmes';
import { usePaginatedChannels } from '@/features/live/hooks/use-paginated-channels';
import { useProgrammeCategories } from '@/features/live/hooks/use-programme-categories';
import { resolvePlayableChannel } from '@/features/live/resolve-channel';
import { isChannelFavorite } from '@/lib/channel-utils';
import { FAVORITES_GROUP_SENTINEL, getEffectiveFavoriteGroups, type GroupOption } from '@/lib/group-utils';
import { channelParam, epgProgrammeParam } from '@/lib/route-params';
import type { Channel } from '@/types/playlist.types';
import type { EpgProgramme } from 'expo-m3u-parser';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { ROW_HEIGHT } from './epg-constants';
import { EpgChannelColumn } from './epg-channel-column';
import { EpgCurrentTimeIndicator } from './epg-current-time-indicator';
import { EpgFilterModal } from './epg-filter-modal';
import { EpgGuideTopBar } from './epg-guide-top-bar';
import { EpgProgrammeGrid } from './epg-programme-grid';
import { EpgSkeleton } from './epg-skeleton';
import { EpgTimeHeader } from './epg-time-header';

const GUIDE_PAGE_SIZE = 50;

/**
 * How many extra pages one end-reach may pull in while the visible row count
 * stays flat. Without a cap a playlist whose tail has no EPG data at all would
 * page to the end in one gesture.
 */
const MAX_PAGES_PER_END_REACH = 5;

interface EpgGuideProps {
  playlistId: string | null | undefined;
  favoriteChannels: string[];
  favoriteGroups: string[];
  /** Fetched once by the screen and shared with the channel grid. */
  groups: GroupOption[];
  excludeAdult: boolean;
  onChannelPress: (channel: Channel) => void;
  onToggleFavoriteGroup: (name: string) => void;
  /** Screen-level refresh (favorites and the first-page cache). */
  onRefresh: () => void;
  /** True while the screen-level refresh is in flight. */
  isRefreshing: boolean;
}

export function EpgGuide({
  playlistId,
  favoriteChannels,
  favoriteGroups,
  groups,
  excludeAdult,
  onChannelPress,
  onToggleFavoriteGroup,
  onRefresh,
  isRefreshing,
}: EpgGuideProps) {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [hideEmptyChannels, setHideEmptyChannels] = useState(true);
  const [filterModalVisible, setFilterModalVisible] = useState(false);

  // Group selection state — defaults to all channels
  const [selectedGroupName, setSelectedGroupName] = useState<string>('');

  // Synchronous state derivation: reset filters on playlist change, mirroring
  // the channel grid. A group, a search or a day carried over from the previous
  // playlist filters the guide down to nothing with no sign of why.
  const [prevPlaylistId, setPrevPlaylistId] = useState(playlistId);

  if (playlistId !== prevPlaylistId) {
    setPrevPlaylistId(playlistId);
    setSearchText('');
    setSelectedGroupName('');
    setHideEmptyChannels(true);
    setSelectedDate(new Date());
  }

  const scrollX = useSharedValue(0);
  const scrollY = useSharedValue(0);

  const iconColor = useThemeColor({}, 'icon');

  // Translate group selection for the paginated channels query. An empty array
  // means "your favorite groups aren't in this playlist" — a filter that matches
  // nothing, which must not fall back to every channel.
  const channelGroups = selectedGroupName === FAVORITES_GROUP_SENTINEL
    ? getEffectiveFavoriteGroups(favoriteGroups, groups)
    : selectedGroupName
      ? [selectedGroupName]
      : undefined;

  // Own channel fetching with pagination
  const {
    channels: guideChannels,
    isLoading: isLoadingChannels,
    isRefreshing: isRefreshingChannels,
    hasMore: hasMoreChannels,
    loadMore: loadMoreChannels,
    isLoadingMore: isLoadingMoreChannels,
    error: channelsError,
    refresh: refreshChannels,
    retry: retryChannels,
  } = usePaginatedChannels({
    playlistId,
    groups: channelGroups,
    contentType: 'live',
    favoriteChannelIds: favoriteChannels,
    excludeAdult,
    pageSize: GUIDE_PAGE_SIZE,
  });

  // Sort channels: favorites first, then the rest
  const sortedChannels = useMemo(() => {
    const favoriteIds = new Set(favoriteChannels);
    const favorites: Channel[] = [];
    const rest: Channel[] = [];
    for (const channel of guideChannels) {
      (isChannelFavorite(channel, favoriteIds) ? favorites : rest).push(channel);
    }
    return [...favorites, ...rest];
  }, [guideChannels, favoriteChannels]);

  // Fetch EPG data for the selected day
  const {
    programmesByChannel,
    isLoading,
    isFetching: isFetchingProgrammes,
    refresh: refreshProgrammes,
  } = useGuideProgrammes(sortedChannels, selectedDate, sortedChannels.length > 0);

  // Derive unique categories from programme data
  const categories = useProgrammeCategories(programmesByChannel);

  const isSearchActive = isEpgSearchActive(searchText);

  // A category only exists while some loaded programme carries it; keeping a
  // vanished one selected filters everything away with no way back. An empty
  // list is not a vanished category though — it is a day (or a page) whose
  // programmes haven't arrived yet, and pruning on it dropped the filter every
  // time the guide reloaded.
  useEffect(() => {
    if (categories.length > 0 && selectedCategory && !categories.includes(selectedCategory)) {
      setSelectedCategory(null);
    }
  }, [categories, selectedCategory]);

  // Filter programmes by category and search text
  const filteredProgrammesByChannel = useMemo(() => {
    if (!selectedCategory && !isSearchActive) {
      return programmesByChannel;
    }

    const filtered = new Map<string, EpgProgramme[]>();
    const searchLower = searchText.trim().toLowerCase();

    for (const [channelId, programmes] of programmesByChannel) {
      const filteredProgs = programmes.filter((p) => {
        if (selectedCategory && p.category !== selectedCategory) return false;
        if (isSearchActive && !p.title.toLowerCase().includes(searchLower)) return false;
        return true;
      });
      if (filteredProgs.length > 0) {
        filtered.set(channelId, filteredProgs);
      }
    }

    return filtered;
  }, [programmesByChannel, selectedCategory, searchText, isSearchActive]);

  // Filter channels for display based on EPG data and active filters
  const displayChannels = useMemo(() => {
    return sortedChannels.filter((channel) => {
      const tvgId = channel.tvg?.id ?? '';
      if (hideEmptyChannels && !programmesByChannel.has(tvgId)) return false;
      if ((isSearchActive || selectedCategory) && !filteredProgrammesByChannel.has(tvgId)) return false;
      return true;
    });
  }, [sortedChannels, programmesByChannel, filteredProgrammesByChannel, hideEmptyChannels, isSearchActive, selectedCategory]);

  // Backend search for text filtering across ALL channels
  const { searchProgrammesByChannel, searchChannels, isSearching } = useEpgSearch(
    searchText,
    selectedDate,
    selectedCategory,
    sortedChannels
  );

  // Choose effective data source based on search state
  const effectiveChannels = isSearchActive ? searchChannels : displayChannels;
  const effectiveProgrammes = isSearchActive ? searchProgrammesByChannel : filteredProgrammesByChannel;
  const effectiveLoading = isSearchActive ? isSearching : (isLoadingChannels || isLoading);

  // A page whose channels all lack EPG data adds no row, so the list's content
  // height doesn't change and `onEndReached` never fires again. Keep pulling
  // pages — bounded — until the visible count actually grows.
  const remainingPagesRef = useRef(0);
  const lastDisplayCountRef = useRef(displayChannels.length);

  const requestMoreChannels = useCallback(() => {
    remainingPagesRef.current = MAX_PAGES_PER_END_REACH;
    loadMoreChannels();
  }, [loadMoreChannels]);

  useEffect(() => {
    if (remainingPagesRef.current <= 0) return;
    // Wait for the appended page and its programmes to land first.
    if (isLoadingMoreChannels || isFetchingProgrammes) return;

    if (displayChannels.length !== lastDisplayCountRef.current) {
      lastDisplayCountRef.current = displayChannels.length;
      remainingPagesRef.current = 0;
      return;
    }
    if (!hasMoreChannels) {
      remainingPagesRef.current = 0;
      return;
    }

    remainingPagesRef.current -= 1;
    loadMoreChannels();
  }, [
    displayChannels.length,
    isLoadingMoreChannels,
    isFetchingProgrammes,
    hasMoreChannels,
    loadMoreChannels,
  ]);

  // Compute day boundaries
  const dayStartSeconds = useMemo(() => {
    const d = new Date(selectedDate);
    d.setHours(0, 0, 0, 0);
    return Math.floor(d.getTime() / 1000);
  }, [selectedDate]);

  const gridHeight = effectiveChannels.length * ROW_HEIGHT;

  // Active filter count for badge (only non-default states count)
  const activeFilterCount = (!hideEmptyChannels ? 1 : 0) + (selectedCategory ? 1 : 0);

  // Opening a programme is a navigation, not screen state: the guide stays
  // mounted behind the detail route, which stays in history, so back walks
  // player → channel → programme → guide.
  //
  // The channel travels with the programme when the guide has it, so the
  // surface knows whether there is anything to watch; it is resolved against
  // the database at press time there, as it is here.
  const handleProgrammePress = useCallback(
    (programme: EpgProgramme) => {
      const channel = effectiveChannels.find((ch) => ch.tvg?.id === programme.channelId);

      router.push({
        pathname: '/programme',
        params: {
          playlistId: playlistId ?? '',
          programme: epgProgrammeParam.encode(programme),
          ...(channel ? { channel: channelParam.encode(channel) } : {}),
        },
      });
    },
    [router, playlistId, effectiveChannels]
  );

  /**
   * Search results can include channels that pagination hasn't loaded, which
   * `useEpgSearch` represents with a url-less placeholder — resolved against the
   * database before the channel is handed on (see `resolvePlayableChannel`).
   */
  const handleChannelPress = useCallback(
    (channel: Channel) => {
      void resolvePlayableChannel(playlistId, channel).then((resolved) => {
        if (resolved) onChannelPress(resolved);
      });
    },
    [onChannelPress, playlistId]
  );

  const handleFilterPress = useCallback(() => {
    setFilterModalVisible(true);
  }, []);

  const handleFilterClose = useCallback(() => {
    setFilterModalVisible(false);
  }, []);

  const handleRefresh = useCallback(() => {
    onRefresh();
    refreshChannels();
    refreshProgrammes();
  }, [onRefresh, refreshChannels, refreshProgrammes]);

  const errorMessage = channelsError;

  return (
    <View style={styles.container}>
      {/* Guide Top Bar: date nav, group selector, categories, search + filter */}
      <EpgGuideTopBar
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        categories={categories}
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
        searchText={searchText}
        onSearchTextChange={setSearchText}
        groups={groups}
        selectedGroupName={selectedGroupName}
        onGroupSelect={setSelectedGroupName}
        favoriteGroups={favoriteGroups}
        onToggleFavoriteGroup={onToggleFavoriteGroup}
        onFilterPress={handleFilterPress}
        activeFilterCount={activeFilterCount}
      />

      {/* Loading state — only show skeleton on initial load, not when loading more */}
      {effectiveLoading && programmesByChannel.size === 0 && <EpgSkeleton />}

      {/* Channels couldn't be loaded at all — say so instead of "no channels" */}
      {!effectiveLoading && errorMessage && effectiveChannels.length === 0 && (
        <ThemedView style={styles.emptyContainer}>
          <IconSymbol name="exclamationmark.triangle" size={48} color={iconColor} />
          <ThemedText style={styles.emptyText}>{errorMessage}</ThemedText>
          <ThemedText style={styles.retryText} onPress={retryChannels}>
            Tap to retry
          </ThemedText>
        </ThemedView>
      )}

      {/* Empty state */}
      {!effectiveLoading && !errorMessage && effectiveChannels.length === 0 && sortedChannels.length === 0 && (
        <ThemedView style={styles.emptyContainer}>
          <IconSymbol name="tv" size={48} color={iconColor} />
          <ThemedText style={styles.emptyText}>
            {channelGroups?.length === 0
              ? 'None of your favorite groups are in this playlist'
              : 'No channels available'}
          </ThemedText>
        </ThemedView>
      )}

      {!effectiveLoading && !errorMessage && !isSearchActive && sortedChannels.length > 0 && programmesByChannel.size === 0 && (
        <ThemedView style={styles.emptyContainer}>
          <IconSymbol name="calendar" size={48} color={iconColor} />
          <ThemedText style={styles.emptyText}>No EPG data available for this day</ThemedText>
        </ThemedView>
      )}

      {!effectiveLoading && !errorMessage && effectiveChannels.length === 0 && (isSearchActive || (sortedChannels.length > 0 && programmesByChannel.size > 0)) && (
        <ThemedView style={styles.emptyContainer}>
          <IconSymbol name="magnifyingglass" size={48} color={iconColor} />
          <ThemedText style={styles.emptyText}>No matching channels found</ThemedText>
        </ThemedView>
      )}

      {/* EPG Grid */}
      {effectiveChannels.length > 0 && effectiveProgrammes.size > 0 && (
        <View style={styles.gridContainer}>
          {/* Time Header */}
          <EpgTimeHeader scrollX={scrollX} />

          {/* Channel Column + Programme Grid */}
          <View style={styles.bodyRow}>
            <EpgChannelColumn
              channels={effectiveChannels}
              favoriteChannels={favoriteChannels}
              scrollY={scrollY}
              onChannelPress={handleChannelPress}
            />

            <View style={styles.gridWrapper}>
              <EpgCurrentTimeIndicator
                dayStartSeconds={dayStartSeconds}
                scrollX={scrollX}
                height={gridHeight}
              />
              <EpgProgrammeGrid
                channels={effectiveChannels}
                programmesByChannel={effectiveProgrammes}
                dayStartSeconds={dayStartSeconds}
                scrollX={scrollX}
                scrollY={scrollY}
                onProgrammePress={handleProgrammePress}
                onLoadMore={isSearchActive ? undefined : requestMoreChannels}
                hasMore={isSearchActive ? false : hasMoreChannels}
                isLoadingMore={isSearchActive ? false : isLoadingMoreChannels}
                refreshing={isRefreshing || isRefreshingChannels}
                onRefresh={handleRefresh}
              />
            </View>
          </View>
        </View>
      )}

      {/* Filter Modal */}
      <EpgFilterModal
        visible={filterModalVisible}
        onClose={handleFilterClose}
        hideEmptyChannels={hideEmptyChannels}
        onHideEmptyChannelsChange={setHideEmptyChannels}
        categories={categories}
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 14,
    opacity: 0.6,
    marginTop: 12,
    textAlign: 'center',
  },
  retryText: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 16,
    textDecorationLine: 'underline',
  },
  gridContainer: {
    flex: 1,
  },
  bodyRow: {
    flex: 1,
    flexDirection: 'row',
  },
  gridWrapper: {
    flex: 1,
    position: 'relative',
  },
});
