import { useEffect } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

type SkeletonVariant = 'channel' | 'movie' | 'series';

interface SkeletonCardProps {
  variant: SkeletonVariant;
}

const ASPECT_RATIOS: Record<SkeletonVariant, number> = {
  channel: 4 / 3,
  movie: 3 / 4,
  series: 3 / 4,
};

export function SkeletonCard({ variant }: SkeletonCardProps) {
  const colorScheme = useColorScheme();
  const placeholderColor = colorScheme === 'dark' ? '#2a2a2a' : '#e0e0e0';

  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.7, { duration: 600 }), -1, true);
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.imagePlaceholder,
          { aspectRatio: ASPECT_RATIOS[variant], backgroundColor: placeholderColor },
          animatedStyle,
        ]}
      />
      <Animated.View
        style={[styles.textPlaceholder, { backgroundColor: placeholderColor }, animatedStyle]}
      />
      {variant === 'series' && (
        <Animated.View
          style={[
            styles.episodePlaceholder,
            { backgroundColor: placeholderColor },
            animatedStyle,
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingVertical: 4,
  },
  imagePlaceholder: {
    width: '100%',
    borderRadius: 6,
    marginBottom: 4,
  },
  textPlaceholder: {
    height: 26,
    borderRadius: 3,
    width: '100%',
  },
  episodePlaceholder: {
    height: 11,
    borderRadius: 3,
    width: '60%',
    alignSelf: 'center',
    marginTop: 2,
  },
});
