import { useNowSeconds } from '@/hooks/use-now-seconds';
import { THEME } from '@/lib/theme';
import type { EpgProgramme } from 'expo-m3u-parser';
import { StyleSheet, View, useColorScheme } from 'react-native';

interface ProgrammeProgressProps {
  programme: EpgProgramme;
}

/**
 * Shows a thin progress bar overlay at the bottom of a channel card image
 * indicating how far through the current programme we are.
 *
 * Reads the shared clock so the bar actually advances (and resyncs after the
 * app returns from the background) instead of freezing at its mount time.
 */
export function ProgrammeProgress({ programme }: ProgrammeProgressProps) {
  const colorScheme = useColorScheme() ?? 'dark';
  const now = useNowSeconds();
  const duration = programme.stop - programme.start;
  const elapsed = now - programme.start;
  const progressPercent = duration > 0 ? Math.min(Math.max((elapsed / duration) * 100, 0), 100) : 0;

  return (
    <View style={styles.progressTrack}>
      <View
        style={[
          styles.progressBar,
          { width: `${progressPercent}%`, backgroundColor: THEME[colorScheme].ring },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
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
