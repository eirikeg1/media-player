import { AnimatedModal } from '@/components/ui/containers/modal/animated-modal';
import { ModalHeader } from '@/components/ui/containers/modal/modal-header';
import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { ThemedText } from '@/components/ui/display/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { ScrollView, StyleSheet, Switch, TouchableOpacity, View } from 'react-native';

interface EpgFilterModalProps {
  visible: boolean;
  onClose: () => void;
  hideEmptyChannels: boolean;
  onHideEmptyChannelsChange: (value: boolean) => void;
  categories: string[];
  selectedCategory: string | null;
  onSelectCategory: (category: string | null) => void;
}

export function EpgFilterModal({
  visible,
  onClose,
  hideEmptyChannels,
  onHideEmptyChannelsChange,
  categories,
  selectedCategory,
  onSelectCategory,
}: EpgFilterModalProps) {
  const tintColor = useThemeColor({}, 'tint');

  return (
    <AnimatedModal visible={visible} onClose={onClose}>
      <ModalHeader title="Filters" onClose={onClose} />

      <ScrollView style={styles.scrollContent}>
          {/* Hide empty channels toggle */}
          <View style={styles.switchRow}>
            <View style={styles.labelContainer}>
              <ThemedText style={styles.label}>Hide channels without programmes</ThemedText>
            </View>
            <Switch
              value={hideEmptyChannels}
              onValueChange={onHideEmptyChannelsChange}
              trackColor={{ false: '#767577', true: '#007AFF' }}
              accessibilityLabel="Hide channels without programmes"
            />
          </View>

          {/* Category selection */}
          {categories.length > 0 && (
            <View style={styles.categorySection}>
              <ThemedText style={styles.sectionHeader}>Category</ThemedText>

              {/* All option */}
              <TouchableOpacity
                style={styles.categoryRow}
                activeOpacity={0.7}
                onPress={() => onSelectCategory(null)}
              >
                <ThemedText style={styles.categoryText}>All</ThemedText>
                {selectedCategory === null && (
                  <IconSymbol name="checkmark" size={18} color={tintColor} />
                )}
              </TouchableOpacity>

              {/* Individual categories */}
              {categories.map((category) => (
                <TouchableOpacity
                  key={category}
                  style={styles.categoryRow}
                  activeOpacity={0.7}
                  onPress={() => onSelectCategory(category === selectedCategory ? null : category)}
                >
                  <ThemedText
                    numberOfLines={1}
                    style={styles.categoryText}
                  >
                    {category}
                  </ThemedText>
                  {selectedCategory === category && (
                    <IconSymbol name="checkmark" size={18} color={tintColor} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
      </ScrollView>
    </AnimatedModal>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 0,
    padding: 16,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  labelContainer: {
    flex: 1,
    marginRight: 12,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
  },
  categorySection: {
    marginTop: 16,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '600',
    opacity: 0.6,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  categoryText: {
    fontSize: 16,
    flex: 1,
  },
});
