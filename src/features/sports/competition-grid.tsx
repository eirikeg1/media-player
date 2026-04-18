import { ThemedText } from '@/components/ui/display/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { GlassColors } from '@/lib/theme';
import { Image } from 'expo-image';
import type { Competition } from 'expo-m3u-parser';
import { memo, useCallback, useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import {
  CUP_COMPETITION_IDS,
  EUROPEAN_COMPETITION_IDS,
  TOP_COMPETITION_IDS,
} from './competition-groups';

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

  const { topComps, europeanComps, cupComps } = useMemo(() => {
    const orderBy = (ids: readonly number[]) =>
      [...competitions]
        .filter((c) => (ids as readonly number[]).includes(c.providerId))
        .sort((a, b) => ids.indexOf(a.providerId) - ids.indexOf(b.providerId));

    return {
      topComps: orderBy(TOP_COMPETITION_IDS),
      europeanComps: orderBy(EUROPEAN_COMPETITION_IDS),
      cupComps: orderBy(CUP_COMPETITION_IDS),
    };
  }, [competitions]);

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

      {/* Top 6 grid */}
      <View style={styles.grid}>
        {topComps.map(renderCard)}
      </View>

      {/* European section */}
      {europeanComps.length > 0 && (
        <>
          <ThemedText style={styles.sectionLabel}>European</ThemedText>
          <View style={styles.grid}>
            {europeanComps.map(renderCard)}
          </View>
        </>
      )}

      {/* Cups section */}
      {cupComps.length > 0 && (
        <>
          <ThemedText style={styles.sectionLabel}>Cups</ThemedText>
          <View style={styles.grid}>
            {cupComps.map(renderCard)}
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
