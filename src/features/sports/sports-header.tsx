import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { ThemedText } from '@/components/ui/display/themed-text';
import { memo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { DateStrip } from './date-strip';
import { FavoritesPromptCard } from './favorites-prompt-card';
import { SPORTS_ACCENT, useSportsPalette } from './sports-theme';

export type MatchFilter = 'all' | 'live';

interface SportsHeaderProps {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  filter: MatchFilter;
  onFilterChange: (filter: MatchFilter) => void;
  liveCount: number;
  onOpenFavorites: () => void;
  onJumpToToday: () => void;
  isToday: boolean;
  /** Show the "follow your teams" nudge (no favorites yet). */
  showFavoritesPrompt: boolean;
  topInset: number;
}

/** Title bar, day strip and the All/Live filter, rendered above the list. */
export const SportsHeader = memo(function SportsHeader({
  selectedDate,
  onSelectDate,
  filter,
  onFilterChange,
  liveCount,
  onOpenFavorites,
  onJumpToToday,
  isToday,
  showFavoritesPrompt,
  topInset,
}: SportsHeaderProps) {
  const palette = useSportsPalette();

  return (
    <View style={[styles.container, { paddingTop: topInset + 8, backgroundColor: palette.background }]}>
      <View style={styles.titleRow}>
        <ThemedText type="title" style={styles.title} numberOfLines={1}>
          Matches
        </ThemedText>
        <View style={styles.actions}>
          {!isToday && (
            <TouchableOpacity
              onPress={onJumpToToday}
              style={[styles.todayButton, { borderColor: palette.border }]}
              accessibilityRole="button"
              accessibilityLabel="Jump to today"
            >
              <IconSymbol name="calendar" size={14} color={SPORTS_ACCENT.tint} />
              <ThemedText style={styles.todayText}>Today</ThemedText>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={onOpenFavorites}
            style={[styles.favoritesButton, { borderColor: palette.border }]}
            accessibilityRole="button"
            accessibilityLabel="Manage favorite teams"
          >
            <ThemedText style={styles.favoritesText}>Favorites</ThemedText>
          </TouchableOpacity>
        </View>
      </View>

      <DateStrip selected={selectedDate} onSelect={onSelectDate} />

      <View style={styles.filters}>
        <FilterChip label="All" selected={filter === 'all'} onPress={() => onFilterChange('all')} />
        <FilterChip
          label={liveCount > 0 ? `Live · ${liveCount}` : 'Live'}
          selected={filter === 'live'}
          onPress={() => onFilterChange('live')}
          accent={SPORTS_ACCENT.live}
          showDot={liveCount > 0}
        />
      </View>

      {showFavoritesPrompt && <FavoritesPromptCard onAddTeams={onOpenFavorites} />}
    </View>
  );
});

function FilterChip({
  label,
  selected,
  onPress,
  accent = SPORTS_ACCENT.tint,
  showDot = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  accent?: string;
  showDot?: boolean;
}) {
  const palette = useSportsPalette();
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.chip, { backgroundColor: selected ? accent : palette.faint }]}
      activeOpacity={0.7}
    >
      {showDot && <View style={[styles.chipDot, { backgroundColor: selected ? '#FFFFFF' : accent }]} />}
      <ThemedText style={[styles.chipText, { color: selected ? '#FFFFFF' : palette.text }]}>{label}</ThemedText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
    paddingBottom: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 28,
    // The two text buttons beside it take priority when the row runs out of room.
    flexShrink: 1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  todayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  todayText: {
    fontSize: 13,
    fontWeight: '600',
    color: SPORTS_ACCENT.tint,
  },
  favoritesButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  // No color override: ThemedText's default keeps it white on the dark theme
  // and legible on the light one, where a hardcoded white would vanish.
  favoritesText: {
    fontSize: 13,
    fontWeight: '600',
  },
  filters: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
  },
  chipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
