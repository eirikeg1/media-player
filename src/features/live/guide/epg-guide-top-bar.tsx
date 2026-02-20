import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { Input } from '@/components/ui/controls/inputs/input';
import { ChannelGroupButton } from '@/features/live/channel-group-button';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { GroupOption } from '@/lib/group-utils';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { EpgCategoryFilter } from './epg-category-filter';
import { EpgDateNavigator } from './epg-date-navigator';

interface EpgGuideTopBarProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  categories: string[];
  selectedCategory: string | null;
  onSelectCategory: (category: string | null) => void;
  searchText: string;
  onSearchTextChange: (text: string) => void;
  groups: GroupOption[];
  selectedGroupName: string;
  onGroupSelect: (groupName: string) => void;
  favoriteGroups: string[];
  onToggleFavoriteGroup: (name: string) => void;
  onFilterPress: () => void;
  activeFilterCount: number;
}

export const EpgGuideTopBar = React.memo(function EpgGuideTopBar({
  selectedDate,
  onDateChange,
  categories,
  selectedCategory,
  onSelectCategory,
  searchText,
  onSearchTextChange,
  groups,
  selectedGroupName,
  onGroupSelect,
  favoriteGroups,
  onToggleFavoriteGroup,
  onFilterPress,
  activeFilterCount,
}: EpgGuideTopBarProps) {
  const tintColor = useThemeColor({}, 'tint');
  const iconColor = useThemeColor({}, 'icon');

  return (
    <View style={styles.container}>
      {/* Date navigation */}
      <EpgDateNavigator
        selectedDate={selectedDate}
        onDateChange={onDateChange}
      />

      {/* Group selector */}
      <View style={styles.groupRow}>
        <ChannelGroupButton
          groups={groups}
          selectedGroupName={selectedGroupName}
          onGroupSelect={onGroupSelect}
          favoriteGroups={favoriteGroups}
          onToggleFavoriteGroup={onToggleFavoriteGroup}
        />
      </View>

      {/* Category filter pills */}
      <EpgCategoryFilter
        categories={categories}
        selectedCategory={selectedCategory}
        onSelectCategory={onSelectCategory}
      />

      {/* Programme search + filter button */}
      <View style={styles.searchRow}>
        <Input
          placeholder="Search programmes..."
          value={searchText}
          onChangeText={onSearchTextChange}
          style={styles.searchInput}
        />
        <TouchableOpacity
          onPress={onFilterPress}
          style={styles.filterButton}
          activeOpacity={0.7}
          accessibilityLabel="Open filters"
        >
          <IconSymbol name="slider.horizontal.3" size={20} color={iconColor} />
          {activeFilterCount > 0 && (
            <View style={[styles.filterBadge, { backgroundColor: tintColor }]} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
  groupRow: {
    paddingHorizontal: 8,
  },
  searchRow: {
    paddingHorizontal: 8,
    paddingBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    minHeight: 24,
    fontSize: 14,
  },
  filterButton: {
    padding: 6,
    position: 'relative',
  },
  filterBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
