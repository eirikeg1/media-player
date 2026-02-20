import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useGuideProgrammes } from '@/features/live/hooks/use-guide-programmes';
import { usePaginatedChannels } from '@/features/live/hooks/use-paginated-channels';
import { useProgrammeCategories } from '@/features/live/hooks/use-programme-categories';
import { useGroups } from '@/features/live/hooks/use-groups';
import { FAVORITES_GROUP_SENTINEL, getEffectiveFavoriteGroups } from '@/lib/group-utils';
import type { Channel } from '@/types/playlist.types';
import type { EpgProgramme } from 'expo-m3u-parser';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { ROW_HEIGHT } from './epg-constants';
import { EpgChannelColumn } from './epg-channel-column';
import { EpgCurrentTimeIndicator } from './epg-current-time-indicator';
import { EpgFilterModal } from './epg-filter-modal';
import { EpgGuideTopBar } from './epg-guide-top-bar';
import { EpgProgrammeDetailModal } from './epg-programme-detail-modal';
import { EpgProgrammeGrid } from './epg-programme-grid';
import { EpgTimeHeader } from './epg-time-header';

interface EpgGuideProps {
  playlistId: string | null | undefined;
  favoriteChannels: string[];
  favoriteGroups: string[];
  excludeAdult: boolean;
  onChannelPress: (channel: Channel) => void;
  onToggleFavoriteGroup: (name: string) => void;
}

export function EpgGuide({
  playlistId,
  favoriteChannels,
  favoriteGroups,
  excludeAdult,
  onChannelPress,
  onToggleFavoriteGroup,
}: EpgGuideProps) {
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [selectedProgramme, setSelectedProgramme] = useState<EpgProgramme | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [hideEmptyChannels, setHideEmptyChannels] = useState(true);
  const [filterModalVisible, setFilterModalVisible] = useState(false);

  // Group selection state — defaults to favorites if available
  const [selectedGroupName, setSelectedGroupName] = useState<string>(() =>
    favoriteGroups.length > 0 ? FAVORITES_GROUP_SENTINEL : ''
  );

  const scrollX = useSharedValue(0);
  const scrollY = useSharedValue(0);

  const tintColor = useThemeColor({}, 'tint');
  const iconColor = useThemeColor({}, 'icon');

  // Fetch groups for the guide's own group selector
  const { groups } = useGroups(playlistId, 'live', favoriteGroups, excludeAdult);

  // Translate group selection for the paginated channels query
  const channelGroups = selectedGroupName === FAVORITES_GROUP_SENTINEL
    ? getEffectiveFavoriteGroups(favoriteGroups, groups)
    : selectedGroupName
      ? [selectedGroupName]
      : undefined;

  // Own channel fetching
  const { channels: guideChannels } = usePaginatedChannels({
    playlistId,
    groups: channelGroups,
    contentType: 'live',
    favoriteChannelIds: favoriteChannels,
    excludeAdult,
    pageSize: 500,
  });

  // Sort channels: favorites first, then the rest
  const sortedChannels = useMemo(() => {
    const favSet = new Set(favoriteChannels);
    const favs: Channel[] = [];
    const rest: Channel[] = [];
    for (const ch of guideChannels) {
      const id = ch.tvg?.id ?? ch.name ?? '';
      if (favSet.has(id)) {
        favs.push(ch);
      } else {
        rest.push(ch);
      }
    }
    return [...favs, ...rest];
  }, [guideChannels, favoriteChannels]);

  // Fetch EPG data for the selected day
  const { programmesByChannel, isLoading } = useGuideProgrammes(
    sortedChannels,
    selectedDate,
    sortedChannels.length > 0
  );

  // Derive unique categories from programme data
  const categories = useProgrammeCategories(programmesByChannel);

  // Filter programmes by category and search text
  const filteredProgrammesByChannel = useMemo(() => {
    if (!selectedCategory && !searchText.trim()) {
      return programmesByChannel;
    }

    const filtered = new Map<string, EpgProgramme[]>();
    const searchLower = searchText.trim().toLowerCase();

    for (const [channelId, programmes] of programmesByChannel) {
      const filteredProgs = programmes.filter((p) => {
        if (selectedCategory && p.category !== selectedCategory) return false;
        if (searchLower && !p.title.toLowerCase().includes(searchLower)) return false;
        return true;
      });
      if (filteredProgs.length > 0) {
        filtered.set(channelId, filteredProgs);
      }
    }

    return filtered;
  }, [programmesByChannel, selectedCategory, searchText]);

  // Filter channels for display based on EPG data and active filters
  const displayChannels = useMemo(() => {
    return sortedChannels.filter((channel) => {
      const tvgId = channel.tvg?.id ?? '';
      if (hideEmptyChannels && !programmesByChannel.has(tvgId)) return false;
      if ((searchText.trim() || selectedCategory) && !filteredProgrammesByChannel.has(tvgId)) return false;
      return true;
    });
  }, [sortedChannels, programmesByChannel, filteredProgrammesByChannel, hideEmptyChannels, searchText, selectedCategory]);

  // Compute day boundaries
  const dayStartSeconds = useMemo(() => {
    const d = new Date(selectedDate);
    d.setHours(0, 0, 0, 0);
    return Math.floor(d.getTime() / 1000);
  }, [selectedDate]);

  const nowSeconds = Math.floor(Date.now() / 1000);
  const gridHeight = displayChannels.length * ROW_HEIGHT;

  // Active filter count for badge (only non-default states count)
  const activeFilterCount = (!hideEmptyChannels ? 1 : 0) + (selectedCategory ? 1 : 0);

  const handleProgrammePress = useCallback((programme: EpgProgramme) => {
    setSelectedProgramme(programme);
    setDetailModalVisible(true);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setDetailModalVisible(false);
  }, []);

  // Find channel for the selected programme (for "Watch Channel" action)
  const selectedProgrammeChannel = useMemo(() => {
    if (!selectedProgramme) return null;
    return displayChannels.find(
      (ch) => ch.tvg?.id === selectedProgramme.channelId
    ) ?? null;
  }, [selectedProgramme, displayChannels]);

  const handleWatchChannel = useCallback(() => {
    if (selectedProgrammeChannel) {
      setDetailModalVisible(false);
      onChannelPress(selectedProgrammeChannel);
    }
  }, [selectedProgrammeChannel, onChannelPress]);

  const handleFilterPress = useCallback(() => {
    setFilterModalVisible(true);
  }, []);

  const handleFilterClose = useCallback(() => {
    setFilterModalVisible(false);
  }, []);

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

      {/* Loading state */}
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color={tintColor} />
        </View>
      )}

      {/* Empty state */}
      {!isLoading && displayChannels.length === 0 && sortedChannels.length === 0 && (
        <ThemedView style={styles.emptyContainer}>
          <IconSymbol name="tv" size={48} color={iconColor} />
          <ThemedText style={styles.emptyText}>No channels available</ThemedText>
        </ThemedView>
      )}

      {!isLoading && sortedChannels.length > 0 && programmesByChannel.size === 0 && (
        <ThemedView style={styles.emptyContainer}>
          <IconSymbol name="calendar" size={48} color={iconColor} />
          <ThemedText style={styles.emptyText}>No EPG data available for this day</ThemedText>
        </ThemedView>
      )}

      {!isLoading && displayChannels.length === 0 && sortedChannels.length > 0 && programmesByChannel.size > 0 && (
        <ThemedView style={styles.emptyContainer}>
          <IconSymbol name="magnifyingglass" size={48} color={iconColor} />
          <ThemedText style={styles.emptyText}>No matching channels found</ThemedText>
        </ThemedView>
      )}

      {/* EPG Grid */}
      {displayChannels.length > 0 && programmesByChannel.size > 0 && (
        <View style={styles.gridContainer}>
          {/* Time Header */}
          <EpgTimeHeader scrollX={scrollX} />

          {/* Channel Column + Programme Grid */}
          <View style={styles.bodyRow}>
            <EpgChannelColumn
              channels={displayChannels}
              favoriteChannels={favoriteChannels}
              scrollY={scrollY}
              onChannelPress={onChannelPress}
            />

            <View style={styles.gridWrapper}>
              <EpgCurrentTimeIndicator
                dayStartSeconds={dayStartSeconds}
                scrollX={scrollX}
                height={gridHeight}
              />
              <EpgProgrammeGrid
                channels={displayChannels}
                programmesByChannel={filteredProgrammesByChannel}
                dayStartSeconds={dayStartSeconds}
                nowSeconds={nowSeconds}
                scrollX={scrollX}
                scrollY={scrollY}
                onProgrammePress={handleProgrammePress}
              />
            </View>
          </View>
        </View>
      )}

      {/* Programme Detail Modal */}
      <EpgProgrammeDetailModal
        visible={detailModalVisible}
        onClose={handleCloseDetail}
        programme={selectedProgramme}
        onWatchChannel={selectedProgrammeChannel ? handleWatchChannel : undefined}
      />

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
    minHeight: 400,
  },
  loadingOverlay: {
    padding: 24,
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    minHeight: 200,
  },
  emptyText: {
    fontSize: 14,
    opacity: 0.6,
    marginTop: 12,
    textAlign: 'center',
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
