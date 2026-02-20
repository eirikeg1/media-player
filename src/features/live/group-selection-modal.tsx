import { ModalHeader } from '@/components/ui/containers/modal/modal-header';
import { Button } from '@/components/ui/controls/button';
import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { ThemedText } from '@/components/ui/display/themed-text';
import { Input } from '@/components/ui/controls/inputs/input';
import { ThemedView } from '@/components/ui/display/themed-view';
import { useSelectionColors } from '@/constants/selection-theme';
import { GroupItemComponent, type GroupItem } from '@/features/live/group-item';
import { FAVORITES_GROUP_SENTINEL, isAdultGroup } from '@/lib/group-utils';
import type { GroupSortOption } from '@/types/sort.types';
import { useThemeColor } from '@/hooks/use-theme-color';
import { FlashList } from '@shopify/flash-list';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Modal,
  StyleSheet,
  TouchableOpacity,
  View,
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
  /** When true, allows selecting multiple groups with checkmarks + Apply button */
  multiSelect?: boolean;
  /** Currently selected group names (multi-select mode only) */
  selectedGroupNames?: string[];
  /** Called with the full selection when Apply is pressed (multi-select mode only) */
  onGroupsSelect?: (names: string[]) => void;
}


export function GroupSelectionModal({
  visible,
  onClose,
  groups,
  selectedGroupName,
  onGroupSelect,
  favoriteGroups,
  onToggleFavoriteGroup,
  multiSelect,
  selectedGroupNames,
  onGroupsSelect,
}: GroupSelectionModalProps) {
  const [filterText, setFilterText] = useState('');
  const [groupSort, setGroupSort] = useState<GroupSortOption>('alphabetical');
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  // Local multi-select state — initialized from props when modal opens
  const [multiSelectLocal, setMultiSelectLocal] = useState<string[]>([]);
  const selectionColors = useSelectionColors();
  const insets = useSafeAreaInsets();
  const tintColor = useThemeColor({}, 'tint');
  const textColor = useThemeColor({}, 'text');

  // Sync local multi-select state when modal becomes visible
  const prevVisibleRef = useRef(visible);
  if (visible && !prevVisibleRef.current && multiSelect) {
    setMultiSelectLocal(selectedGroupNames ?? []);
  }
  prevVisibleRef.current = visible;

  const GROUP_SORT_LABELS: Record<GroupSortOption, string> = {
    alphabetical: 'A-Z',
    channelCount: 'Count',
    playlistOrder: 'Playlist',
  };

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
    // Secondary sort within each tier based on groupSort
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

      // Secondary sort based on groupSort option
      switch (groupSort) {
        case 'channelCount':
          return b.channelCount - a.channelCount;
        case 'playlistOrder':
          return (a.firstPosition ?? 0) - (b.firstPosition ?? 0);
        case 'alphabetical':
        default:
          return a.name.localeCompare(b.name);
      }
    });

    return [...pinned, ...sorted];
  }, [groups, filterText, favoriteGroups, groupSort]);

  const handleGroupSelect = useCallback((groupName: string) => {
    if (multiSelect) {
      // Toggle in local state without closing
      setMultiSelectLocal((prev) =>
        prev.includes(groupName)
          ? prev.filter((n) => n !== groupName)
          : [...prev, groupName]
      );
      return;
    }
    onGroupSelect(groupName);
    setFilterText('');
    onClose();
  }, [multiSelect, onGroupSelect, onClose]);

  const handleApplyMultiSelect = useCallback(() => {
    onGroupsSelect?.(multiSelectLocal);
    setFilterText('');
    onClose();
  }, [multiSelectLocal, onGroupsSelect, onClose]);

  const handleClose = useCallback(() => {
    setFilterText('');
    setShowSortDropdown(false);
    onClose();
  }, [onClose]);

  const handleSortSelect = useCallback((sort: GroupSortOption) => {
    setGroupSort(sort);
    setShowSortDropdown(false);
  }, []);

  const renderItem = useCallback(({ item }: { item: GroupItem }) => {
    const isFavoritesSentinel = item.name === FAVORITES_GROUP_SENTINEL;
    const isSelected = multiSelect
      ? multiSelectLocal.includes(item.name)
      : item.name === selectedGroupName;
    return (
      <GroupItemComponent
        item={item}
        isSelected={isSelected}
        onPress={handleGroupSelect}
        selectionColors={selectionColors}
        isFavorite={isFavoritesSentinel || favoriteGroups.includes(item.name)}
        onToggleFavorite={isFavoritesSentinel ? undefined : onToggleFavoriteGroup}
      />
    );
  }, [multiSelect, multiSelectLocal, selectedGroupName, handleGroupSelect, selectionColors, favoriteGroups, onToggleFavoriteGroup]);

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

          {/* Filter Input + Sort Button */}
          <ThemedView style={styles.filterContainer}>
            <View style={styles.filterRow}>
              <View style={styles.inputWrapper}>
                <Input
                  placeholder="Filter groups..."
                  value={filterText}
                  onChangeText={setFilterText}
                  style={styles.filterInput}
                />
              </View>
              <TouchableOpacity
                style={styles.sortIconButton}
                onPress={() => setShowSortDropdown((v) => !v)}
                activeOpacity={0.7}
                accessibilityLabel={`Sort groups by ${GROUP_SORT_LABELS[groupSort]}`}
              >
                <IconSymbol
                  name="arrow.up.arrow.down"
                  size={20}
                  color={textColor}
                />
              </TouchableOpacity>
            </View>

            {/* Sort Dropdown */}
            {showSortDropdown && (
              <View style={styles.sortDropdown}>
                {(Object.keys(GROUP_SORT_LABELS) as GroupSortOption[]).map((option) => {
                  const isActive = groupSort === option;
                  return (
                    <TouchableOpacity
                      key={option}
                      style={styles.sortDropdownRow}
                      onPress={() => handleSortSelect(option)}
                      activeOpacity={0.7}
                    >
                      <ThemedText
                        style={[
                          styles.sortDropdownLabel,
                          isActive && { color: tintColor, fontWeight: '600' },
                        ]}
                      >
                        {GROUP_SORT_LABELS[option]}
                      </ThemedText>
                      {isActive && (
                        <IconSymbol name="checkmark" size={16} color={tintColor} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </ThemedView>

          <View style={styles.listWrapper}>
            <FlashList
              data={displayedGroups}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              numColumns={2}
              contentContainerStyle={styles.listContent}
              extraData={multiSelect ? multiSelectLocal : selectedGroupName}
            />
          </View>

          {multiSelect && (
            <View style={styles.applyButtonContainer}>
              <Button
                title={`Apply (${multiSelectLocal.length} selected)`}
                variant="primary"
                onPress={handleApplyMultiSelect}
                fullWidth
              />
            </View>
          )}
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
    paddingTop: 16,
    zIndex: 1,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inputWrapper: {
    flex: 1,
    height: 44,
  },
  filterInput: {
    height: 40,
    fontSize: 16,
  },
  sortIconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  sortDropdown: {
    marginTop: 8,
    borderRadius: 8,
    overflow: 'hidden',
  },
  sortDropdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sortDropdownLabel: {
    fontSize: 15,
  },
  listWrapper: {
    flex: 1,
    overflow: 'hidden',
  },
  listContent: {
    paddingVertical: 16,
    paddingHorizontal: 8,
    paddingBottom: 32,
  },
  applyButtonContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 24,
  },
});
