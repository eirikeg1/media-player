import { Dimensions, StyleSheet, View } from 'react-native';
import { SkeletonCard } from './skeleton-card';

type SkeletonVariant = 'channel' | 'movie' | 'series';

interface SkeletonGridProps {
  variant: SkeletonVariant;
  count?: number;
  columns?: number;
  gap?: number;
  padding?: number;
}

export function SkeletonGrid({
  variant,
  count = 16,
  columns = 4,
  gap = 4,
  padding = 5,
}: SkeletonGridProps) {
  const { width: screenWidth } = Dimensions.get('window');
  const cardWidth = (screenWidth - padding * 2 - gap * (columns - 1)) / columns;

  return (
    <View style={styles.grid}>
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={{
            width: cardWidth,
            marginRight: (i + 1) % columns === 0 ? 0 : gap,
            marginBottom: gap,
          }}
        >
          <SkeletonCard variant={variant} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
