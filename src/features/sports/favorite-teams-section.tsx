import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { ThemedText } from '@/components/ui/display/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { GlassColors } from '@/lib/theme';
import { Image } from 'expo-image';
import type { Team } from 'expo-m3u-parser';
import { memo, useCallback } from 'react';
import { Alert, FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';

import { teamKey } from './utils';

interface FavoriteTeamsSectionProps {
  teams: Team[];
  onAddPress: () => void;
  onRemoveTeam: (provider: string, providerId: number) => void;
  onSelectTeam: (team: Team) => void;
  selectedTeamKey: string | null;
}

export const FavoriteTeamsSection = memo(function FavoriteTeamsSection({
  teams,
  onAddPress,
  onRemoveTeam,
  onSelectTeam,
  selectedTeamKey,
}: FavoriteTeamsSectionProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const textColor = useThemeColor({}, 'text');
  const tintColor = useThemeColor({}, 'tint');

  const handleLongPress = useCallback(
    (team: Team) => {
      Alert.alert(
        'Remove Team',
        `Remove ${team.name} from favorites?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => onRemoveTeam(team.provider, team.providerId),
          },
        ]
      );
    },
    [onRemoveTeam]
  );

  const renderTeam = useCallback(
    ({ item }: { item: Team }) => {
      const key = teamKey(item.provider, item.providerId);
      const isSelected = selectedTeamKey === key;

      return (
        <TouchableOpacity
          style={[
            styles.teamBadge,
            {
              backgroundColor: isDark ? GlassColors.dark.surface : GlassColors.light.surface,
              borderColor: isSelected
                ? tintColor
                : isDark
                  ? GlassColors.dark.border
                  : GlassColors.light.border,
            },
            isSelected && styles.teamBadgeSelected,
          ]}
          onPress={() => onSelectTeam(item)}
          onLongPress={() => handleLongPress(item)}
          activeOpacity={0.7}
          accessibilityLabel={`${item.name}${isSelected ? ', selected' : ''}. Tap to select, long press to remove`}
        >
          {item.crestUrl ? (
            <Image source={{ uri: item.crestUrl }} style={styles.crest} contentFit="contain" />
          ) : (
            <IconSymbol name="sportscourt.fill" size={28} color={textColor} />
          )}
          <ThemedText style={styles.teamName} numberOfLines={1}>
            {item.shortName || item.tla || item.name}
          </ThemedText>
        </TouchableOpacity>
      );
    },
    [isDark, textColor, tintColor, handleLongPress, onSelectTeam, selectedTeamKey]
  );

  return (
    <View style={styles.container}>
      <ThemedText type="subtitle" style={styles.header}>
        Favorite Teams
      </ThemedText>
      <FlatList
        data={teams}
        renderItem={renderTeam}
        keyExtractor={(item) => `${item.provider}-${item.providerId}`}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        extraData={selectedTeamKey}
        ListFooterComponent={
          <TouchableOpacity
            style={[
              styles.addButton,
              {
                backgroundColor: isDark ? GlassColors.dark.surface : GlassColors.light.surface,
                borderColor: isDark ? GlassColors.dark.border : GlassColors.light.border,
              },
            ]}
            onPress={onAddPress}
            accessibilityLabel="Add favorite team"
          >
            <IconSymbol name="plus" size={28} color={textColor} />
          </TouchableOpacity>
        }
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  header: {
    paddingHorizontal: 16,
  },
  listContent: {
    paddingHorizontal: 16,
    gap: 12,
  },
  teamBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    width: 80,
    gap: 6,
  },
  teamBadgeSelected: {
    borderWidth: 2,
  },
  crest: {
    width: 32,
    height: 32,
  },
  teamName: {
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
  },
  addButton: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    width: 80,
    height: 80,
  },
});
