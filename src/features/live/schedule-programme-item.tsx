import { ThemedText } from '@/components/ui/display/themed-text';
import { CategoryPill } from '@/features/videos/category-pill';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { formatTime } from '@/lib/format-time';
import { THEME } from '@/lib/theme';
import type { EpgProgramme } from 'expo-m3u-parser';
import { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface ScheduleProgrammeItemProps {
  programme: EpgProgramme;
  isCurrent: boolean;
}

export function ScheduleProgrammeItem({ programme, isCurrent }: ScheduleProgrammeItemProps) {
  const [expanded, setExpanded] = useState(false);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const ringColor = THEME[isDark ? 'dark' : 'light'].ring;

  const now = Date.now() / 1000;
  const duration = programme.stop - programme.start;
  const elapsed = now - programme.start;
  const progressPercent = duration > 0 ? Math.min(Math.max((elapsed / duration) * 100, 0), 100) : 0;

  const hasDescription = !!programme.description;
  const isPast = programme.stop < now;

  return (
    <TouchableOpacity
      style={[
        styles.container,
        isCurrent && { backgroundColor: isDark ? 'rgba(0, 122, 255, 0.12)' : 'rgba(0, 122, 255, 0.08)' },
        isPast && !isCurrent && { opacity: 0.5 },
      ]}
      onPress={() => hasDescription && setExpanded(!expanded)}
      activeOpacity={hasDescription ? 0.7 : 1}
      disabled={!hasDescription}
    >
      <View style={styles.timeColumn}>
        <ThemedText style={styles.timeText}>{formatTime(programme.start)}</ThemedText>
        <ThemedText style={[styles.timeText, styles.endTime]}>{formatTime(programme.stop)}</ThemedText>
      </View>

      <View style={styles.contentColumn}>
        <ThemedText style={[styles.title, isCurrent && { fontWeight: '700' }]} numberOfLines={expanded ? undefined : 2}>
          {programme.title}
        </ThemedText>

        {programme.subTitle && (
          <ThemedText style={styles.subtitle} numberOfLines={expanded ? undefined : 1}>
            {programme.subTitle}
          </ThemedText>
        )}

        {programme.category && (
          <View style={styles.categoryRow}>
            <CategoryPill label={programme.category} />
          </View>
        )}

        {isCurrent && (
          <View style={styles.progressTrack}>
            <View style={[styles.progressBar, { width: `${progressPercent}%`, backgroundColor: ringColor }]} />
          </View>
        )}

        {programme.description && (
          <ThemedText
            style={styles.description}
            numberOfLines={expanded ? undefined : 2}
          >
            {programme.description}
          </ThemedText>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128, 128, 128, 0.2)',
  },
  timeColumn: {
    width: 56,
    marginRight: 12,
  },
  timeText: {
    fontSize: 13,
    fontWeight: '500',
  },
  endTime: {
    opacity: 0.5,
    fontSize: 11,
    marginTop: 2,
  },
  contentColumn: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '500',
  },
  subtitle: {
    fontSize: 12,
    opacity: 0.7,
    marginTop: 2,
  },
  categoryRow: {
    flexDirection: 'row',
    marginTop: 6,
  },
  progressTrack: {
    height: 3,
    backgroundColor: 'rgba(128, 128, 128, 0.2)',
    borderRadius: 1.5,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 1.5,
  },
  description: {
    fontSize: 12,
    opacity: 0.7,
    marginTop: 8,
    lineHeight: 18,
  },
});
