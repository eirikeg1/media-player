import { SortButton } from '@/components/domain/sort/sort-button';
import { Button } from '@/components/ui/controls/button';
import { Input } from '@/components/ui/controls/inputs/input';
import type { SortOption } from '@/types/sort.types';
import { StyleSheet, View } from 'react-native';
import { ChannelGroupButton } from './channel-group-button';

interface GroupOption {
  name: string;
  channelCount: number;
}

export type LiveViewMode = 'channels' | 'guide';

interface LiveTopBarProps {
  viewMode: LiveViewMode;
  onViewModeChange: (mode: LiveViewMode) => void;
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
  viewMode,
  onViewModeChange,
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
        {/* Channels / Guide Toggle */}
        <View style={styles.toggleRow}>
          <Button
            title="Channels"
            onPress={() => onViewModeChange('channels')}
            variant={viewMode === 'channels' ? 'primary' : 'secondary'}
            size="large"
            style={styles.toggleButton}
          />
          <Button
            title="Guide"
            onPress={() => onViewModeChange('guide')}
            variant={viewMode === 'guide' ? 'primary' : 'secondary'}
            size="large"
            style={styles.toggleButton}
          />
        </View>

        {/* Channel-specific filters — only visible in channels mode */}
        {viewMode === 'channels' && (
          <>
            <ChannelGroupButton
              groups={groups}
              selectedGroupName={selectedGroupName}
              onGroupSelect={onGroupSelect}
              favoriteGroups={favoriteGroups}
              onToggleFavoriteGroup={onToggleFavoriteGroup}
            />

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
          </>
        )}
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
