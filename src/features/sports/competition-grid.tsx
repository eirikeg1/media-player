import { ThemedText } from '@/components/ui/display/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { GlassColors } from '@/lib/theme';
import { Image } from 'expo-image';
import type { Competition } from 'expo-m3u-parser';
import { memo, useCallback, useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { groupCompetitions } from './competition-groups';

interface CompetitionGridProps {
  competitions: Competition[];
  selectedCompId: number | null;
  onSelect: (id: number | null) => void;
  isLoading: boolean;
}

const COLUMNS = 3;
const HORIZONTAL_PADDING = 16;
const GAP = 8;

export const CompetitionGrid = memo(function CompetitionGrid({
  competitions,
  selectedCompId,
  onSelect,
  isLoading,
}: CompetitionGridProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const tintColor = useThemeColor({}, 'tint');
  const { width: screenWidth } = useWindowDimensions();

  const cardWidth = (screenWidth - HORIZONTAL_PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS;

  const { top: topComps, international: internationalComps } = useMemo(
    () => groupCompetitions(competitions),
    [competitions]
  );

  const surface = isDark ? GlassColors.dark.surface : GlassColors.light.surface;
  const border = isDark ? GlassColors.dark.border : GlassColors.light.border;
  const selectedBg = isDark ? 'rgba(0, 122, 255, 0.15)' : 'rgba(0, 122, 255, 0.08)';

  const renderCard = useCallback(
    (comp: Competition) => {
      const isSelected = selectedCompId === comp.providerId;
      return (
        <Pressable
          key={comp.providerId}
          style={[
            styles.card,
            {
              width: cardWidth,
              backgroundColor: isSelected ? selectedBg : surface,
              borderColor: isSelected ? tintColor : border,
              borderWidth: isSelected ? 2 : 1,
            },
          ]}
          onPress={() => onSelect(comp.providerId)}
          accessibilityLabel={`${comp.name}${isSelected ? ', selected' : ''}`}
          accessibilityRole="button"
        >
          {comp.emblemUrl ? (
            <Image source={{ uri: comp.emblemUrl }} style={styles.emblem} contentFit="contain" />
          ) : (
            <View style={styles.emblemPlaceholder} />
          )}
          <ThemedText style={styles.cardLabel} numberOfLines={2}>
            {comp.name}
          </ThemedText>
        </Pressable>
      );
    },
    [selectedCompId, cardWidth, surface, border, selectedBg, tintColor, onSelect]
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator />
      </View>
    );
  }

  const isAllSelected = selectedCompId === null;

  return (
    <View style={styles.container}>
      {/* "All" chip */}
      <Pressable
        style={[
          styles.allChip,
          {
            backgroundColor: isAllSelected ? selectedBg : surface,
            borderColor: isAllSelected ? tintColor : border,
            borderWidth: isAllSelected ? 2 : 1,
          },
        ]}
        onPress={() => onSelect(null)}
        accessibilityLabel={`All competitions${isAllSelected ? ', selected' : ''}`}
        accessibilityRole="button"
      >
        <ThemedText style={[styles.allChipLabel, isAllSelected && { color: tintColor }]}>
          All Competitions
        </ThemedText>
      </Pressable>

      {/* Domestic leagues */}
      <View style={styles.grid}>
        {topComps.map(renderCard)}
      </View>

      {/* International section */}
      {internationalComps.length > 0 && (
        <>
          <ThemedText style={styles.sectionLabel}>International</ThemedText>
          <View style={styles.grid}>
            {internationalComps.map(renderCard)}
          </View>
        </>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  loadingContainer: {
    padding: 32,
    alignItems: 'center',
  },
  allChip: {
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  allChipLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.5,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },
  card: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 12,
    gap: 6,
  },
  emblem: {
    width: 40,
    height: 40,
  },
  emblemPlaceholder: {
    width: 40,
    height: 40,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
  },
});
