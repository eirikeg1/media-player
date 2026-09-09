import { useEffect } from 'react';
import type { DimensionValue, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type AnimatedStyle,
} from 'react-native-reanimated';

/** The pulse the placeholder blocks fade between, and how long one leg takes. */
const PULSE_MIN = 0.3;
const PULSE_MAX = 0.7;
const PULSE_DURATION = 600;

/** Style produced by {@link useSkeletonPulse} and passed down to each block. */
export type SkeletonPulse = AnimatedStyle<ViewStyle>;

/**
 * Opacity pulse shared by every skeleton block on screen. A composite skeleton
 * calls this once and hands the style to all of its blocks — one shared value
 * per screen, not one per row.
 */
export function useSkeletonPulse(): SkeletonPulse {
  const opacity = useSharedValue(PULSE_MIN);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(PULSE_MAX, { duration: PULSE_DURATION }), -1, true);
  }, [opacity]);

  return useAnimatedStyle(() => ({ opacity: opacity.value }));
}

/** Placeholder grey that reads on either scheme's default surface. */
export function skeletonColor(isDark: boolean): string {
  return isDark ? '#2a2a2a' : '#e0e0e0';
}

interface SkeletonBlockProps {
  width?: DimensionValue;
  /** Omitted only when `style` sizes the block instead (an aspect ratio, flex). */
  height?: DimensionValue;
  borderRadius?: number;
  color: string;
  /** The pulse from {@link useSkeletonPulse}, shared by the whole skeleton. */
  pulse: SkeletonPulse;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** One pulsing placeholder rectangle. */
export function SkeletonBlock({
  width,
  height,
  borderRadius = 4,
  color,
  pulse,
  style,
  testID,
}: SkeletonBlockProps) {
  return (
    <Animated.View
      testID={testID}
      style={[{ width, height, borderRadius, backgroundColor: color }, style, pulse]}
    />
  );
}
