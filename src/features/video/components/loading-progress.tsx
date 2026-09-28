import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/ui/display/themed-text';
import { VIDEO_COLORS } from '../constants';

interface LoadingProgressProps {
  stage: 'connecting' | 'buffering' | 'preparing';
}

const STAGE_LABELS: Record<LoadingProgressProps['stage'], string> = {
  connecting: 'Connecting...',
  buffering: 'Buffering...',
  preparing: 'Loading...',
};

/** The overlay covering the video surface until the first frame is playable. */
export function LoadingProgress({ stage }: LoadingProgressProps) {
  const opacity = useSharedValue(0.7);

  // Subtle fade animation
  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 1000 }), -1, true);
    return () => cancelAnimation(opacity);
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <View
      className="absolute inset-0 justify-center items-center"
      style={{ backgroundColor: VIDEO_COLORS.scrim }}
    >
      <Animated.View style={[{ alignItems: 'center' }, animatedStyle]}>
        <ActivityIndicator size="large" color={VIDEO_COLORS.text} />
        <ThemedText
          style={{
            fontSize: 16,
            color: VIDEO_COLORS.text,
            marginTop: 16,
            textAlign: 'center',
          }}
        >
          {STAGE_LABELS[stage]}
        </ThemedText>
      </Animated.View>
    </View>
  );
}
