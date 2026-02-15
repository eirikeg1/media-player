import { ThemedText } from '@/components/ui/display/themed-text';
import type { RecentlyWatchedItem } from '@/types/user.types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { RecentlyWatchedCard } from './recently-watched-card';

// Carousel layout constants
const CARD_SIZE = 160;
const CARD_CONTAINER_SIZE = 200;
const OVERLAP = 70;
const PADDING_LEFT = 40;
const ACTIVE_SCALE = 1.2;
const SIZE_STEP = 6;
const MIN_SCALE = 0.7;
const SCALE_DURATION = 200;
const SCROLL_THROTTLE = 16;

interface RecentlyWatchedCarouselProps {
  items: RecentlyWatchedItem[];
  onItemPress: (item: RecentlyWatchedItem) => void;
}

/** Single card wrapper — handles overlap, scale animation, z-index */
function OverlapCard({
  index,
  activeIndex,
  totalItems,
  children,
  onPress,
}: {
  index: number;
  activeIndex: number;
  totalItems: number;
  children: React.ReactElement;
  onPress: () => void;
}) {
  const distance = Math.abs(index - activeIndex);
  const scale =
    distance === 0
      ? ACTIVE_SCALE
      : Math.max((CARD_SIZE - distance * SIZE_STEP) / CARD_SIZE, MIN_SCALE);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withTiming(scale, { duration: SCALE_DURATION }) }],
  }));

  const zIndex = distance === 0 ? totalItems + 1 : totalItems - distance;

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.cardPressable,
        {
          marginLeft: index > 0 ? -OVERLAP : 0,
          zIndex,
        },
      ]}
    >
      <Animated.View style={[styles.cardAnimated, animatedStyle]}>
        <View style={styles.cardInner}>{children}</View>
      </Animated.View>
    </Pressable>
  );
}

export function RecentlyWatchedCarousel({ items, onItemPress }: RecentlyWatchedCarouselProps) {
  const [windowWidth, setWindowWidth] = useState(Dimensions.get('window').width);
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);

  const snapInterval = CARD_SIZE - OVERLAP;

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setWindowWidth(window.width);
    });
    return () => subscription?.remove();
  }, []);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const scrollPosition = event.nativeEvent.contentOffset.x;
      const newIndex = Math.round(scrollPosition / snapInterval);
      if (newIndex >= 0 && newIndex < items.length && newIndex !== activeIndex) {
        setActiveIndex(newIndex);
      }
    },
    [activeIndex, items.length, snapInterval],
  );

  const handleMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const scrollPosition = event.nativeEvent.contentOffset.x;
      const currentIndex = Math.round(scrollPosition / snapInterval);
      const targetPosition = currentIndex * snapInterval;

      scrollViewRef.current?.scrollTo({ x: targetPosition, animated: true });

      if (currentIndex >= 0 && currentIndex < items.length && currentIndex !== activeIndex) {
        setActiveIndex(currentIndex);
      }
    },
    [activeIndex, items.length, snapInterval],
  );

  const handleCardPress = useCallback(
    (index: number, item: RecentlyWatchedItem) => {
      if (index !== activeIndex) {
        const targetPosition = index * snapInterval;
        scrollViewRef.current?.scrollTo({ x: targetPosition, animated: true });
        setActiveIndex(index);
      } else {
        onItemPress(item);
      }
    },
    [activeIndex, snapInterval, onItemPress],
  );

  const contentContainerStyle = useMemo(
    () => ({
      paddingLeft: PADDING_LEFT,
      paddingRight: windowWidth - CARD_SIZE - PADDING_LEFT,
    }),
    [windowWidth],
  );

  if (items.length === 0) return null;

  const activeName = items[activeIndex]?.channelName ?? '';

  return (
    <View style={styles.container}>
      <ThemedText type="subtitle" style={styles.sectionTitle}>
        Continue Watching
      </ThemedText>

      <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={snapInterval}
        decelerationRate={0.98}
        disableIntervalMomentum
        onScroll={handleScroll}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        scrollEventThrottle={SCROLL_THROTTLE}
        contentContainerStyle={contentContainerStyle}
        nestedScrollEnabled
      >
        {items.map((item, index) => (
          <OverlapCard
            key={item.channelId}
            index={index}
            activeIndex={activeIndex}
            totalItems={items.length}
            onPress={() => handleCardPress(index, item)}
          >
            <RecentlyWatchedCard
              item={item}
              isActive={index === activeIndex}
              size={CARD_SIZE}
            />
          </OverlapCard>
        ))}
      </ScrollView>

      {activeName ? (
        <ThemedText style={styles.activeName} numberOfLines={1}>
          {activeName}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
  sectionTitle: {
    paddingHorizontal: 8,
  },
  cardPressable: {
    width: CARD_SIZE,
    height: CARD_CONTAINER_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardAnimated: {
    width: CARD_SIZE,
    height: CARD_SIZE,
  },
  cardInner: {
    width: CARD_SIZE,
    height: CARD_SIZE,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  activeName: {
    fontSize: 12,
    opacity: 0.7,
    paddingHorizontal: PADDING_LEFT,
    fontWeight: '500',
  },
});
