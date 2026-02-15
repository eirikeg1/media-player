import { SortButton } from '@/components/domain/sort/sort-button';
import { Input } from '@/components/ui/controls/inputs/input';
import type { SortOption } from '@/types/sort.types';
import { StyleSheet, View } from 'react-native';
import { ChannelGroupButton } from './channel-group-button';

interface GroupOption {
  name: string;
  channelCount: number;
}

interface LiveTopBarProps {
  groups: GroupOption[];
  selectedGroupName: string;
  onGroupSelect: (groupName: string) => void;
  searchText: string;
  onSearchTextChange: (text: string) => void;
  favoriteGroups: string[];
  onToggleFavoriteGroup: (name: string) => void;
  sortOptions: SortOption[];
  selectedSortId: string;
  sortOrder: 'asc' | 'desc';
  onSortSelect: (id: string) => void;
}

export function LiveTopBar({
  groups,
  selectedGroupName,
  onGroupSelect,
  searchText,
  onSearchTextChange,
  favoriteGroups,
  onToggleFavoriteGroup,
  sortOptions,
  selectedSortId,
  sortOrder,
  onSortSelect,
}: LiveTopBarProps) {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Group Selector */}
        <ChannelGroupButton
          groups={groups}
          selectedGroupName={selectedGroupName}
          onGroupSelect={onGroupSelect}
          favoriteGroups={favoriteGroups}
          onToggleFavoriteGroup={onToggleFavoriteGroup}
        />

        {/* Search Input + Sort Button */}
        <View style={styles.searchRow}>
          <Input
            placeholder="Search channels..."
            value={searchText}
            onChangeText={onSearchTextChange}
            style={styles.searchInput}
          />
          <SortButton
            options={sortOptions}
            selectedId={selectedSortId}
            sortOrder={sortOrder}
            onSelect={onSortSelect}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 8,
    paddingBottom: 12,
  },
  content: {
    flexDirection: 'column',
    gap: 12,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    minHeight: 24,
    fontSize: 14,
  },
});
