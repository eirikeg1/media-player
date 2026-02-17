import { ThemedText } from '@/components/ui/display/themed-text';
import { THEME } from '@/lib/theme';
import type { EpgProgramme } from 'expo-m3u-parser';
import { StyleSheet, View, useColorScheme } from 'react-native';

interface ProgrammeProgressProps {
  programme: EpgProgramme;
}

/**
 * Shows "now playing" info on a channel card:
 * - Programme title (single line, truncated)
 * - Thin progress bar at the bottom of the image area
 */
export function ProgrammeProgress({ programme }: ProgrammeProgressProps) {
  const colorScheme = useColorScheme() ?? 'dark';
  const now = Date.now() / 1000;
  const duration = programme.stop - programme.start;
  const elapsed = now - programme.start;
  const progressPercent = duration > 0 ? Math.min(Math.max((elapsed / duration) * 100, 0), 100) : 0;

  return (
    <>
      <ThemedText style={styles.programmeTitle} numberOfLines={1}>
        {programme.title}
      </ThemedText>
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressBar,
            { width: `${progressPercent}%`, backgroundColor: THEME[colorScheme].ring },
          ]}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  programmeTitle: {
    fontSize: 9,
    textAlign: 'center',
    opacity: 0.7,
    lineHeight: 11,
    marginTop: 1,
  },
  progressTrack: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  progressBar: {
    height: '100%',
  },
});
