import { ThemedText } from '@/components/ui/display/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import React, { useCallback } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity } from 'react-native';

interface EpgCategoryFilterProps {
  categories: string[];
  selectedCategory: string | null;
  onSelectCategory: (category: string | null) => void;
}

function EpgCategoryFilterInner({
  categories,
  selectedCategory,
  onSelectCategory,
}: EpgCategoryFilterProps) {
  const tintColor = useThemeColor({}, 'tint');
  const textColor = useThemeColor({}, 'text');

  const handlePress = useCallback(
    (category: string | null) => {
      onSelectCategory(category === selectedCategory ? null : category);
    },
    [selectedCategory, onSelectCategory]
  );

  if (categories.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      <TouchableOpacity
        style={[
          styles.pill,
          {
            backgroundColor: selectedCategory === null ? tintColor : 'transparent',
            borderColor: tintColor,
          },
        ]}
        activeOpacity={0.7}
        onPress={() => handlePress(null)}
      >
        <ThemedText
          style={[
            styles.pillText,
            { color: selectedCategory === null ? '#fff' : textColor },
          ]}
        >
          All
        </ThemedText>
      </TouchableOpacity>

      {categories.map((category) => {
        const isSelected = selectedCategory === category;
        return (
          <TouchableOpacity
            key={category}
            style={[
              styles.pill,
              {
                backgroundColor: isSelected ? tintColor : 'transparent',
                borderColor: tintColor,
              },
            ]}
            activeOpacity={0.7}
            onPress={() => handlePress(category)}
          >
            <ThemedText
              numberOfLines={1}
              style={[
                styles.pillText,
                { color: isSelected ? '#fff' : textColor },
              ]}
            >
              {category}
            </ThemedText>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

export const EpgCategoryFilter = React.memo(EpgCategoryFilterInner);

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 6,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
