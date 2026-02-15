import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { SortSelectionModal } from '@/components/domain/sort/sort-selection-modal';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { GlassColors } from '@/lib/theme';
import type { SortOption } from '@/types/sort.types';
import { useState } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';

interface SortButtonProps {
  options: SortOption[];
  selectedId: string;
  sortOrder: 'asc' | 'desc';
  onSelect: (id: string) => void;
}

export function SortButton({ options, selectedId, sortOrder, onSelect }: SortButtonProps) {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const iconColor = useThemeColor({}, 'icon');

  return (
    <>
      <TouchableOpacity
        style={[
          styles.button,
          {
            backgroundColor: isDark ? GlassColors.dark.surface : GlassColors.light.surface,
            borderColor: isDark ? GlassColors.dark.border : GlassColors.light.border,
          },
        ]}
        onPress={() => setIsModalVisible(true)}
        activeOpacity={0.7}
        accessibilityLabel={`Sort. Tap to change sort order`}
        accessibilityHint="Opens sort selection modal"
      >
        <IconSymbol name="arrow.up.arrow.down" size={18} color={iconColor} />
      </TouchableOpacity>

      <SortSelectionModal
        visible={isModalVisible}
        onClose={() => setIsModalVisible(false)}
        options={options}
        selectedId={selectedId}
        sortOrder={sortOrder}
        onSelect={onSelect}
      />
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
  },
});
