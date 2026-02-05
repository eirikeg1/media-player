import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { ThemedText } from '@/components/ui/display/themed-text';
import type { useSelectionColors } from '@/constants/selection-theme';
import { FAVORITES_GROUP_SENTINEL } from '@/lib/group-utils';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

export type SelectionColors = ReturnType<typeof useSelectionColors>;

export interface GroupItem {
  name: string;
  channelCount: number;
}

export interface GroupItemProps {
  /**
   * Group data to display
   */
  item: GroupItem;

  /**
   * Whether this group is currently selected
   */
  isSelected: boolean;

  /**
   * Callback when group is pressed
   */
  onPress: (groupName: string) => void;

  /**
   * Pre-computed selection colors (lifted from parent to avoid per-item hook calls)
   */
  selectionColors: SelectionColors;

  /**
   * Whether this group is a favorite
   */
  isFavorite?: boolean;

  /**
   * Callback when favorite is toggled
   */
  onToggleFavorite?: (groupName: string) => void;
}

export const GroupItemComponent = React.memo(function GroupItemComponent({
  item,
  isSelected,
  onPress,
  selectionColors,
  isFavorite,
  onToggleFavorite,
}: GroupItemProps) {
  const colors = isSelected ? selectionColors.selected : selectionColors.unselected;

  const handlePress = () => {
    onPress(item.name);
  };

  const handleFavoritePress = () => {
    if (onToggleFavorite) {
      onToggleFavorite(item.name);
    }
  };

  const isFavoritesSentinel = item.name === FAVORITES_GROUP_SENTINEL;
  const displayName = isFavoritesSentinel ? 'Favorites' : item.name || 'All Channels';
  const iconName = isFavoritesSentinel ? 'star.fill' : 'folder';
  const channelText = `${item.channelCount} channel${item.channelCount !== 1 ? 's' : ''}`;

  return (
    <TouchableOpacity
      style={[
        styles.groupItem,
        {
          backgroundColor: colors.background,
          borderColor: colors.border,
        },
      ]}
      onPress={handlePress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Select ${displayName} group`}
      accessibilityHint={`${item.channelCount} channels in this group`}
    >
      <View style={styles.headerContainer}>
        <IconSymbol
          name={iconName}
          size={24}
          color={isFavoritesSentinel ? '#FFD700' : colors.icon}
          style={styles.groupIcon}
        />
        {onToggleFavorite && (
          <TouchableOpacity 
            onPress={handleFavoritePress}
            style={styles.favoriteButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <IconSymbol
              name={isFavorite ? 'star.fill' : 'star'}
              size={20}
              color={isFavorite ? '#FFD700' : colors.icon}
            />
          </TouchableOpacity>
        )}
      </View>

      <ThemedText
        style={[
          styles.groupName,
          { color: colors.text },
        ]}
        numberOfLines={2}
      >
        {displayName}
      </ThemedText>

      <ThemedText
        style={[
          styles.channelCount,
          { color: colors.subtext },
        ]}
      >
        {channelText}
      </ThemedText>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  groupItem: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    marginHorizontal: 8,
    alignItems: 'center',
    minHeight: 120,
  },
  headerContainer: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    position: 'relative',
  },
  groupIcon: {
    // Centered icon
  },
  favoriteButton: {
    position: 'absolute',
    right: 0,
    top: 0,
  },
  groupName: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 4,
    minHeight: 32,
  },
  channelCount: {
    fontSize: 12,
    textAlign: 'center',
  },
});