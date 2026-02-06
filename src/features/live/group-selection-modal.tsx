import { GroupItemComponent, type GroupItem } from '@/features/live/group-item';
import { ModalHeader } from '@/components/ui/containers/modal/modal-header';
import { Input } from '@/components/ui/controls/inputs/input';
import { ThemedView } from '@/components/ui/display/themed-view';
import { useSelectionColors } from '@/constants/selection-theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { FAVORITES_GROUP_SENTINEL, isAdultGroup } from '@/lib/group-utils';
import { FlashList } from '@shopify/flash-list';
import { useCallback, useMemo, useState } from 'react';
import {
    Modal,
    StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';


interface GroupSelectionModalProps {
  visible: boolean;
  onClose: () => void;
  groups: GroupItem[];
  selectedGroupName?: string;
  onGroupSelect: (groupName: string) => void;
  favoriteGroups: string[];
  onToggleFavoriteGroup: (name: string) => void;
}


export function GroupSelectionModal({
  visible,
  onClose,
  groups,
  selectedGroupName,
  onGroupSelect,
  favoriteGroups,
  onToggleFavoriteGroup,
}: GroupSelectionModalProps) {
  const [filterText, setFilterText] = useState('');
  const selectionColors = useSelectionColors();
  const insets = useSafeAreaInsets();

  // Theme colors
  const borderColor = useThemeColor({ light: '#ddd', dark: '#333' }, 'icon');

  // Filter and sort groups
  const displayedGroups = useMemo(() => {
    // Separate pinned entries (Favorites sentinel and "All Channels") from sortable groups
    const pinned = groups.filter(g => g.name === FAVORITES_GROUP_SENTINEL || g.name === '');
    let sortable = groups.filter(g => g.name !== FAVORITES_GROUP_SENTINEL && g.name !== '');

    // Filter sortable groups (pinned entries are always shown)
    if (filterText.trim()) {
      sortable = sortable.filter(group =>
        group.name.toLowerCase().includes(filterText.toLowerCase())
      );
    }

    // Sort: non-adult favorites > non-adult non-favorites > adult favorites > adult non-favorites
    // Alphabetical within each tier
    const sorted = [...sortable].sort((a, b) => {
      const isAAdult = isAdultGroup(a.name);
      const isBAdult = isAdultGroup(b.name);

      // Adult groups always go after non-adult groups
      if (isAAdult !== isBAdult) return isAAdult ? 1 : -1;

      // Within the same adult/non-adult tier, favorites come first
      const isAFav = favoriteGroups.includes(a.name);
      const isBFav = favoriteGroups.includes(b.name);

      if (isAFav && !isBFav) return -1;
      if (!isAFav && isBFav) return 1;

      return a.name.localeCompare(b.name);
    });

    return [...pinned, ...sorted];
  }, [groups, filterText, favoriteGroups]);

  // Debug logging
  if (__DEV__ && visible) {
    console.log('Modal is visible, groups:', groups.length);
    console.log('Selected group:', selectedGroupName);
    console.log('Filter text:', filterText);
    console.log('Displayed groups:', displayedGroups.length);
  }

  const handleGroupSelect = useCallback((groupName: string) => {
    onGroupSelect(groupName);
    setFilterText(''); // Clear filter when selecting a group
    onClose();
  }, [onGroupSelect, onClose]);

  const handleClose = useCallback(() => {
    setFilterText(''); // Clear filter when closing modal
    onClose();
  }, [onClose]);

  const renderItem = useCallback(({ item }: { item: GroupItem }) => {
    const isFavoritesSentinel = item.name === FAVORITES_GROUP_SENTINEL;
    return (
      <GroupItemComponent
        item={item}
        isSelected={item.name === selectedGroupName}
        onPress={handleGroupSelect}
        selectionColors={selectionColors}
        isFavorite={isFavoritesSentinel || favoriteGroups.includes(item.name)}
        onToggleFavorite={isFavoritesSentinel ? undefined : onToggleFavoriteGroup}
      />
    );
  }, [selectedGroupName, handleGroupSelect, selectionColors, favoriteGroups, onToggleFavoriteGroup]);

  const keyExtractor = useCallback((item: GroupItem) => item.name || 'all-channels', []);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
        <ThemedView style={[styles.modalContent, { paddingTop: insets.top }]}>
          <ModalHeader
            title="Select Channel Group"
            onClose={handleClose}
          />

          {/* Filter Input */}
          <ThemedView style={[styles.filterContainer, { borderBottomColor: borderColor }]}>
            <Input
              placeholder="Filter groups..."
              value={filterText}
              onChangeText={setFilterText}
              style={styles.filterInput}
            />
          </ThemedView>

          <FlashList
            data={displayedGroups}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            numColumns={2}
            contentContainerStyle={styles.listContent}
          />
        </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContent: {
    flex: 1,
  },
  filterContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  filterInput: {
    height: 40,
    fontSize: 16,
  },
  listContent: {
    paddingVertical: 16,
    paddingHorizontal: 8,
    paddingBottom: 32,
  },
});