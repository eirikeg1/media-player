import { ModalHeader } from '@/components/ui/containers/modal/modal-header';
import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { SortOption } from '@/types/sort.types';
import { useCallback } from 'react';
import { Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface SortSelectionModalProps {
  visible: boolean;
  onClose: () => void;
  options: SortOption[];
  selectedId: string;
  sortOrder: 'asc' | 'desc';
  onSelect: (id: string) => void;
}

export function SortSelectionModal({
  visible,
  onClose,
  options,
  selectedId,
  sortOrder,
  onSelect,
}: SortSelectionModalProps) {
  const insets = useSafeAreaInsets();
  const tintColor = useThemeColor({}, 'tint');

  const handleSelect = useCallback(
    (id: string) => {
      onSelect(id);
      onClose();
    },
    [onSelect, onClose],
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={onClose}
    >
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <ModalHeader title="Sort By" onClose={onClose} />
        <View style={styles.optionsList}>
          {options.map((option) => {
            const isSelected = option.id === selectedId;
            return (
              <TouchableOpacity
                key={option.id}
                style={styles.optionRow}
                onPress={() => handleSelect(option.id)}
                activeOpacity={0.7}
              >
                <ThemedText
                  style={[
                    styles.optionLabel,
                    isSelected && { color: tintColor, fontWeight: '600' },
                  ]}
                >
                  {option.label}
                </ThemedText>
                {isSelected && (
                  <IconSymbol
                    name={sortOrder === 'asc' ? 'chevron.up' : 'chevron.down'}
                    size={18}
                    color={tintColor}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  optionsList: {
    paddingVertical: 8,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  optionLabel: {
    fontSize: 17,
  },
});
