import { StyleSheet, useColorScheme, View } from 'react-native';

import { SkeletonBlock, skeletonColor, useSkeletonPulse } from './skeleton';

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
  const color = skeletonColor(colorScheme === 'dark');
  const pulse = useSkeletonPulse();

  return (
    <View style={styles.container}>
      {/* The poster is sized by its aspect ratio rather than a fixed height. */}
      <SkeletonBlock
        width="100%"
        borderRadius={6}
        color={color}
        pulse={pulse}
        style={[styles.imagePlaceholder, { aspectRatio: ASPECT_RATIOS[variant] }]}
      />
      <SkeletonBlock width="100%" height={26} borderRadius={3} color={color} pulse={pulse} />
      {variant === 'series' && (
        <SkeletonBlock
          width="60%"
          height={11}
          borderRadius={3}
          color={color}
          pulse={pulse}
          style={styles.episodePlaceholder}
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
    marginBottom: 4,
  },
  episodePlaceholder: {
    alignSelf: 'center',
    marginTop: 2,
  },
});
