import { useEffect } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

// Carousel layout constants (matching recently-watched-carousel.tsx)
const CARD_SIZE = 160;
const OVERLAP = 70;
const PADDING_LEFT = 40;
const CAROUSEL_CARD_COUNT = 5;
const ACTIVE_SCALE = 1.2;
const STRIP_GAP = 8;
const SCALE_OVERFLOW = (CARD_SIZE * (ACTIVE_SCALE - 1)) / 2;

// Skeleton color pulse endpoints (solid colors to avoid overlap artifacts)
const SKELETON_DARK_LOW = '#1f1f1f';
const SKELETON_DARK_HIGH = '#2a2a2a';
const SKELETON_LIGHT_LOW = '#d4d4d4';
const SKELETON_LIGHT_HIGH = '#e0e0e0';

// Discover row constants (matching discover-row.tsx)
const ITEM_WIDTH = 120;
const ITEM_ASPECT_RATIO = 3 / 4;
const DISCOVER_CARD_COUNT = 5;

export function HomeSkeletonContent() {
  const colorScheme = useColorScheme();
  const placeholderColor = colorScheme === 'dark' ? '#2a2a2a' : '#e0e0e0';

  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.7, { duration: 600 }), -1, true);
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  // Carousel cards: animate backgroundColor instead of opacity to avoid overlap artifacts
  const colorLow = colorScheme === 'dark' ? SKELETON_DARK_LOW : SKELETON_LIGHT_LOW;
  const colorHigh = colorScheme === 'dark' ? SKELETON_DARK_HIGH : SKELETON_LIGHT_HIGH;

  const animatedCardStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      opacity.value,
      [0.3, 0.7],
      [colorLow, colorHigh]
    ),
  }));

  return (
    <View style={styles.container}>
      {/* Skeleton carousel */}
      <View style={styles.section}>
        <Animated.View
          style={[styles.titleBar, { backgroundColor: placeholderColor }, animatedStyle]}
        />
        <View style={styles.carouselRow}>
          {Array.from({ length: CAROUSEL_CARD_COUNT }).map((_, i) => (
            <Animated.View
              key={i}
              style={[
                styles.carouselCard,
                i === 0
                  ? { marginLeft: PADDING_LEFT, transform: [{ scale: ACTIVE_SCALE }] }
                  : i === 1
                    ? { width: CARD_SIZE - OVERLAP - STRIP_GAP - SCALE_OVERFLOW, marginLeft: STRIP_GAP + SCALE_OVERFLOW }
                    : { width: CARD_SIZE - OVERLAP - STRIP_GAP, marginLeft: STRIP_GAP },
                animatedCardStyle,
              ]}
            />
          ))}
        </View>
        <Animated.View
          style={[styles.activeNameBar, { backgroundColor: placeholderColor }, animatedStyle]}
        />
      </View>

      {/* Skeleton discover rows */}
      {[0, 1].map((row) => (
        <View key={row} style={styles.section}>
          <Animated.View
            style={[styles.titleBar, { backgroundColor: placeholderColor }, animatedStyle]}
          />
          <View style={styles.discoverRow}>
            {Array.from({ length: DISCOVER_CARD_COUNT }).map((_, i) => (
              <View key={i} style={styles.discoverItem}>
                <Animated.View
                  style={[
                    styles.discoverCard,
                    { backgroundColor: placeholderColor },
                    animatedStyle,
                  ]}
                />
                <Animated.View
                  style={[
                    styles.discoverLabel,
                    { backgroundColor: placeholderColor },
                    animatedStyle,
                  ]}
                />
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 24,
    paddingVertical: 16,
  },
  section: {
    gap: 4,
  },
  titleBar: {
    height: 24,
    width: 160,
    borderRadius: 4,
    marginHorizontal: 8,
  },
  // Carousel skeleton
  carouselRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: CARD_SIZE + 40,
    paddingLeft: 0,
  },
  carouselCard: {
    width: CARD_SIZE,
    height: CARD_SIZE,
    borderRadius: 8,
  },
  activeNameBar: {
    height: 20,
    width: 200,
    borderRadius: 4,
    marginLeft: PADDING_LEFT,
  },
  // Discover row skeleton
  discoverRow: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    gap: 10,
  },
  discoverItem: {
    width: ITEM_WIDTH,
    gap: 4,
  },
  discoverCard: {
    width: ITEM_WIDTH,
    aspectRatio: ITEM_ASPECT_RATIO,
    borderRadius: 6,
  },
  discoverLabel: {
    height: 26,
    borderRadius: 3,
    width: '100%',
  },
});
