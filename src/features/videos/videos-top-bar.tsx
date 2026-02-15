import { SortButton } from '@/components/domain/sort/sort-button';
import { Button } from '@/components/ui/controls/button';
import { Input } from '@/components/ui/controls/inputs/input';
import { ChannelGroupButton } from '@/features/live/channel-group-button';
import type { SortOption } from '@/types/sort.types';
import { StyleSheet, View } from 'react-native';

interface GroupOption {
  name: string;
  channelCount: number;
}

interface VideosTopBarProps {
  contentType: 'movie' | 'series';
  onContentTypeChange: (type: 'movie' | 'series') => void;
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

export function VideosTopBar({
  contentType,
  onContentTypeChange,
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
}: VideosTopBarProps) {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* VOD / Series Toggle */}
        <View style={styles.toggleRow}>
          <Button
            title="Movies"
            onPress={() => onContentTypeChange('movie')}
            variant={contentType === 'movie' ? 'primary' : 'secondary'}
            size="large"
            style={styles.toggleButton}
          />
          <Button
            title="Series"
            onPress={() => onContentTypeChange('series')}
            variant={contentType === 'series' ? 'primary' : 'secondary'}
            size="large"
            style={styles.toggleButton}
          />
        </View>

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
            placeholder="Search videos..."
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
    paddingBottom: 2,
  },
  content: {
    flexDirection: 'column',
    gap: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  toggleButton: {
    flex: 1,
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
