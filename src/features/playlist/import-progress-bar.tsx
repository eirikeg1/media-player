import { useColorScheme } from '@/hooks/use-color-scheme';
import { GlassColors } from '@/lib/theme';
import {
  PHASE_WEIGHTS,
  useImportProgressStore,
} from '@/stores/playlist/import-progress-store';
import { memo, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

interface ImportProgressBarProps {
  /** Only show progress for this playlist */
  playlistId?: string;
  /** Compact mode: thin bar without label */
  compact?: boolean;
  /** Always render the track (even at 0%), used when parent controls visibility */
  showAlways?: boolean;
}

export const ImportProgressBar = memo(function ImportProgressBar({
  playlistId,
  compact = false,
  showAlways = false,
}: ImportProgressBarProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const activePlaylistId = useImportProgressStore((s) => s.activePlaylistId);
  const overallProgress = useImportProgressStore((s) => s.overallProgress);
  const phase = useImportProgressStore((s) => s.phase);

  const animatedProgress = useSharedValue(0);
  const prevPhaseRef = useRef(phase);

  // Only show if actively importing the specified playlist (or any playlist if no ID given)
  const isActive =
    showAlways ||
    (phase !== null &&
      phase !== 'complete' &&
      (!playlistId || activePlaylistId === playlistId));

  useEffect(() => {
    const phaseChanged = phase !== prevPhaseRef.current;
    prevPhaseRef.current = phase;

    if (overallProgress < 100 && phase) {
      const weights = PHASE_WEIGHTS[phase];
      if (weights) {
        if (phaseChanged) {
          // Catch up to real progress, then immediately resume trickle
          const phaseCeiling = weights[1] - 2;
          const target = Math.min(Math.max(phaseCeiling, overallProgress + 1), 99);
          animatedProgress.value = withSequence(
            withTiming(overallProgress, {
              duration: 400,
              easing: Easing.out(Easing.cubic),
            }),
            withTiming(target, {
              duration: 8000,
              easing: Easing.out(Easing.quad),
            }),
          );
        } else {
          // Same phase — trickle toward ceiling
          const phaseCeiling = weights[1] - 2;
          const target = Math.min(Math.max(phaseCeiling, overallProgress + 1), 99);
          animatedProgress.value = withTiming(target, {
            duration: 8000,
            easing: Easing.out(Easing.quad),
          });
        }
      } else {
        animatedProgress.value = withTiming(overallProgress, {
          duration: 400,
          easing: Easing.out(Easing.cubic),
        });
      }
    } else {
      animatedProgress.value = withTiming(overallProgress, {
        duration: 400,
        easing: Easing.out(Easing.cubic),
      });
    }
  }, [overallProgress, phase, animatedProgress]);

  const barAnimatedStyle = useAnimatedStyle(() => ({
    width: `${animatedProgress.value}%` as `${number}%`,
  }));

  if (!isActive) return null;

  const barHeight = compact ? 3 : 8;
  const glass = isDark ? GlassColors.dark : GlassColors.light;

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      <View
        style={[
          styles.track,
          { height: barHeight, backgroundColor: glass.border },
          compact && styles.trackCompact,
        ]}
      >
        <Animated.View
          style={[styles.fill, { height: barHeight }, barAnimatedStyle]}
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    gap: 8,
  },
  containerCompact: {
    paddingVertical: 4,
    gap: 0,
  },
  track: {
    borderRadius: 4,
    overflow: 'hidden',
  },
  trackCompact: {
    borderRadius: 2,
  },
  fill: {
    backgroundColor: '#007AFF',
    borderRadius: 4,
  },
});
