import { useColorScheme } from '@/hooks/use-color-scheme';
import { GlassColors, TINT } from '@/lib/theme';
import { PHASE_WEIGHTS, useImportProgress } from '@/stores/playlist/import-progress-store';
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
  /** The playlist whose import to show. */
  playlistId: string;
  /** Compact mode: thin bar without label */
  compact?: boolean;
}

export const ImportProgressBar = memo(function ImportProgressBar({
  playlistId,
  compact = false,
}: ImportProgressBarProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const entry = useImportProgress(playlistId);
  const phase = entry?.phase ?? null;
  const overallProgress = entry?.overallProgress ?? 0;

  const animatedProgress = useSharedValue(0);
  const prevPhaseRef = useRef(phase);

  const isActive = phase !== null && phase !== 'complete';

  useEffect(() => {
    const phaseChanged = phase !== prevPhaseRef.current;
    prevPhaseRef.current = phase;

    if (overallProgress < 100 && phase) {
      const weights = PHASE_WEIGHTS[phase];
      if (weights) {
        // Catch up to real progress, then trickle toward the phase ceiling.
        const phaseCeiling = weights[1] - 2;
        const target = Math.min(Math.max(phaseCeiling, overallProgress + 1), 99);
        const trickle = withTiming(target, {
          duration: 8000,
          easing: Easing.out(Easing.quad),
        });
        animatedProgress.value = phaseChanged
          ? withSequence(
              withTiming(overallProgress, {
                duration: 400,
                easing: Easing.out(Easing.cubic),
              }),
              trickle,
            )
          : trickle;
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
        <Animated.View style={[styles.fill, { height: barHeight }, barAnimatedStyle]} />
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
    backgroundColor: TINT,
    borderRadius: 4,
  },
});
