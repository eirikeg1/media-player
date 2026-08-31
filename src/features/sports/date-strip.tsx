import { ThemedText } from '@/components/ui/display/themed-text';
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, useWindowDimensions, View } from 'react-native';

import { addDays, isSameLocalDay, localDateKey, startOfLocalDay } from './date-utils';
import { SPORTS_ACCENT, useSportsPalette } from './sports-theme';

const DAYS_BEFORE = 7;
const DAYS_AFTER = 7;
const CHIP_WIDTH = 56;
const CHIP_GAP = 8;
const EDGE_PADDING = 16;

interface DateStripProps {
  selected: Date;
  onSelect: (date: Date) => void;
}

/** Horizontal day picker centred on today, FotMob-style. */
export const DateStrip = memo(function DateStrip({ selected, onSelect }: DateStripProps) {
  const palette = useSportsPalette();
  const scrollRef = useRef<ScrollView>(null);
  const today = useMemo(() => startOfLocalDay(new Date()), []);
  const days = useMemo(
    () => Array.from({ length: DAYS_BEFORE + DAYS_AFTER + 1 }, (_, i) => addDays(today, i - DAYS_BEFORE)),
    [today]
  );

  const selectedIndex = days.findIndex((d) => isSameLocalDay(d, selected));
  const { width: viewportWidth } = useWindowDimensions();

  /** Scroll offset that centres the selected chip, clamped to the content. */
  const scrollToSelected = useCallback(
    (animated: boolean) => {
      if (selectedIndex < 0) return;
      const contentWidth = EDGE_PADDING * 2 + days.length * CHIP_WIDTH + (days.length - 1) * CHIP_GAP;
      const chipCentre = EDGE_PADDING + selectedIndex * (CHIP_WIDTH + CHIP_GAP) + CHIP_WIDTH / 2;
      const maxOffset = Math.max(0, contentWidth - viewportWidth);
      const x = Math.min(Math.max(chipCentre - viewportWidth / 2, 0), maxOffset);
      scrollRef.current?.scrollTo({ x, animated });
    },
    [selectedIndex, days.length, viewportWidth]
  );

  useEffect(() => {
    scrollToSelected(true);
  }, [scrollToSelected]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
      accessibilityRole="tablist"
      // The mount-time effect runs before the strip is measured, so position it
      // again (without animation) as soon as the content has a size.
      onContentSizeChange={() => scrollToSelected(false)}
    >
      {days.map((day) => {
        const isSelected = isSameLocalDay(day, selected);
        const isToday = isSameLocalDay(day, today);
        return (
          <TouchableOpacity
            key={localDateKey(day)}
            onPress={() => onSelect(day)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={day.toDateString()}
            style={[
              styles.chip,
              { backgroundColor: isSelected ? SPORTS_ACCENT.tint : palette.faint },
            ]}
            activeOpacity={0.7}
          >
            <ThemedText
              style={[styles.weekday, { color: isSelected ? '#FFFFFF' : palette.muted }]}
            >
              {isToday ? 'Today' : day.toLocaleDateString(undefined, { weekday: 'short' })}
            </ThemedText>
            <ThemedText style={[styles.dayNumber, isSelected && styles.selectedText]}>
              {day.getDate()}
            </ThemedText>
            <View style={[styles.dot, isToday && !isSelected && { backgroundColor: SPORTS_ACCENT.tint }]} />
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: EDGE_PADDING,
    gap: CHIP_GAP,
  },
  chip: {
    width: CHIP_WIDTH,
    paddingVertical: 8,
    borderRadius: 14,
    alignItems: 'center',
    gap: 2,
  },
  weekday: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  dayNumber: {
    fontSize: 17,
    fontWeight: '700',
  },
  selectedText: {
    color: '#FFFFFF',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'transparent',
  },
});
