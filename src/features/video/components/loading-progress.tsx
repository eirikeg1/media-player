import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import Animated, {
  useSharedValue,
  withRepeat,
  withTiming,
  useAnimatedStyle,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/ui/display/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';

interface LoadingProgressProps {
  channel: { name: string };
  stage: 'connecting' | 'buffering' | 'preparing';
  progress?: number;
  networkType?: string;
}

export function LoadingProgress({ stage }: LoadingProgressProps) {
  const overlayBackground = useThemeColor({ light: 'rgba(0, 0, 0, 0.8)', dark: 'rgba(0, 0, 0, 0.8)' }, 'background');
  const textColor = useThemeColor({ light: '#fff', dark: '#fff' }, 'background');
  const spinnerColor = useThemeColor({ light: '#fff', dark: '#fff' }, 'tint');

  const opacity = useSharedValue(0.7);

  // Subtle fade animation
  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: 1000 }),
      -1,
      true
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const getLoadingText = () => {
    switch (stage) {
      case 'connecting':
        return 'Connecting...';
      case 'buffering':
        return 'Buffering...';
      case 'preparing':
        return 'Loading...';
      default:
        return 'Loading...';
    }
  };

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: overlayBackground,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Animated.View style={[{ alignItems: 'center' }, animatedStyle]}>
        <ActivityIndicator size="large" color={spinnerColor} />
        <ThemedText
          style={{
            fontSize: 16,
            color: textColor,
            marginTop: 16,
            textAlign: 'center',
          }}
        >
          {getLoadingText()}
        </ThemedText>
      </Animated.View>
    </View>
  );
}