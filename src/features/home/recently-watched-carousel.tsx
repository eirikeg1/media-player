import { ThemedText } from '@/components/ui/display/themed-text';
import { parseEpisodeInfo } from '@/lib/series-utils';
import type { Channel } from '@/types/playlist.types';
import type { RecentlyWatchedItem } from '@/types/user.types';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { RecentlyWatchedCard } from './recently-watched-card';

// Carousel layout constants
const CARD_SIZE = 160;
const CARD_CONTAINER_SIZE = 200;
const OVERLAP = 70;
const PADDING_LEFT = 40;
const ACTIVE_SCALE = 1.2;
const SIZE_STEP = 6;
const MIN_SCALE = 0.7;
const SCROLL_THROTTLE = 16;

/** Distance between two cards' snap positions, i.e. one index step of scroll. */
const SNAP_INTERVAL = CARD_SIZE - OVERLAP;

// The neighbours shrink by SIZE_STEP pixels per index of distance, down to
// MIN_SCALE. Expressed as interpolation stops so the whole curve can be
// evaluated on the UI thread from the scroll offset alone.
const NEIGHBOUR_SCALE = (CARD_SIZE - SIZE_STEP) / CARD_SIZE;
const MIN_SCALE_DISTANCE = (CARD_SIZE * (1 - MIN_SCALE)) / SIZE_STEP;

interface RecentlyWatchedCarouselProps {
  items: RecentlyWatchedItem[];
  onItemPress: (item: RecentlyWatchedItem) => void;
}

interface CarouselCardProps {
  item: RecentlyWatchedItem;
  index: number;
  /** Live scroll offset of the carousel, in pixels. */
  scrollX: SharedValue<number>;
  isActive: boolean;
  zIndex: number;
  onPress: (index: number, item: RecentlyWatchedItem) => void;
}

/** Single card wrapper — handles overlap, scale animation, z-index. */
const CarouselCard = memo(function CarouselCard({
  item,
  index,
  scrollX,
  isActive,
  zIndex,
  onPress,
}: CarouselCardProps) {
  // Scale is derived from the scroll offset on the UI thread. Driving it from
  // React state instead meant a re-render of every card on every scroll frame,
  // and a `withTiming` restarted from inside `useAnimatedStyle` on each of them.
  const animatedStyle = useAnimatedStyle(() => {
    const distance = Math.abs(index - scrollX.value / SNAP_INTERVAL);
    return {
      transform: [
        {
          scale: interpolate(
            distance,
            [0, 1, MIN_SCALE_DISTANCE],
            [ACTIVE_SCALE, NEIGHBOUR_SCALE, MIN_SCALE],
            Extrapolation.CLAMP
          ),
        },
      ],
    };
  });

  const handlePress = useCallback(() => onPress(index, item), [onPress, index, item]);

  return (
    <Pressable
      onPress={handlePress}
      style={[
        styles.cardPressable,
        {
          marginLeft: index > 0 ? -OVERLAP : 0,
          zIndex,
        },
      ]}
    >
      <Animated.View style={[styles.cardAnimated, animatedStyle]}>
        <View style={styles.cardInner}>
          <RecentlyWatchedCard item={item} isActive={isActive} size={CARD_SIZE} />
        </View>
      </Animated.View>
    </Pressable>
  );
});

/**
 * Label for the focused card: the series name plus its season and episode when
 * the episode title actually carries them.
 *
 * `parseEpisodeInfo` falls back to "S1 E<index + 1>" for titles it cannot parse,
 * which for a single history row would be an invented episode number — so the
 * suffix is only appended when the parse found a real pattern (recognisable by
 * the episode title differing from the raw one).
 */
function activeCardLabel(item: RecentlyWatchedItem | undefined): string {
  if (!item) return '';
  if (!item.seriesName) return item.channelName;

  const parsed = parseEpisodeInfo({ name: item.channelName } as Channel);
  if (parsed.episodeTitle === item.channelName) return item.seriesName;

  return `${item.seriesName} · S${parsed.season} E${parsed.episode}`;
}

export function RecentlyWatchedCarousel({ items, onItemPress }: RecentlyWatchedCarouselProps) {
  const { width: windowWidth } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollViewRef = useRef<Animated.ScrollView>(null);
  const scrollX = useSharedValue(0);

  // Read by callbacks that must stay referentially stable so the memoised cards
  // aren't re-rendered by a new handler identity on every parent render.
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;
  const itemCountRef = useRef(items.length);
  itemCountRef.current = items.length;

  /**
   * Publish the settled index to React. Only the title, the progress bar and the
   * z-order depend on it, none of which need a per-frame update — the scale
   * animation reads the scroll offset directly instead.
   */
  const publishActiveIndex = useCallback((index: number) => {
    if (index < 0 || index >= itemCountRef.current) return;
    setActiveIndex(index);
  }, []);

  const scrollHandler = useAnimatedScrollHandler(
    {
      onScroll: (event) => {
        scrollX.value = event.contentOffset.x;
      },
      // A slow release settles without any momentum, so `onMomentumEnd` never
      // fires and the focused card would stay whatever it was before the drag.
      // Both handlers round to the same snap target, so publishing twice for a
      // flick with momentum is idempotent.
      onEndDrag: (event) => {
        runOnJS(publishActiveIndex)(Math.round(event.contentOffset.x / SNAP_INTERVAL));
      },
      onMomentumEnd: (event) => {
        runOnJS(publishActiveIndex)(Math.round(event.contentOffset.x / SNAP_INTERVAL));
      },
    },
    [publishActiveIndex]
  );

  const handleCardPress = useCallback(
    (index: number, item: RecentlyWatchedItem) => {
      // A tap on an off-centre card brings it into focus; a tap on the focused
      // one opens it.
      if (index !== activeIndexRef.current) {
        scrollViewRef.current?.scrollTo({ x: index * SNAP_INTERVAL, animated: true });
        setActiveIndex(index);
        return;
      }
      onItemPress(item);
    },
    [onItemPress]
  );

  const contentContainerStyle = useMemo(
    () => ({
      paddingLeft: PADDING_LEFT,
      paddingRight: windowWidth - CARD_SIZE - PADDING_LEFT,
    }),
    [windowWidth]
  );

  if (items.length === 0) return null;

  // A refreshed history can be shorter than the index the last scroll settled on.
  const focusedIndex = Math.min(activeIndex, items.length - 1);
  const focusedLabel = activeCardLabel(items[focusedIndex]);

  return (
    <View style={styles.container}>
      <ThemedText type="subtitle" style={styles.sectionTitle}>
        Continue Watching
      </ThemedText>

      <Animated.ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={SNAP_INTERVAL}
        decelerationRate={0.98}
        disableIntervalMomentum
        onScroll={scrollHandler}
        scrollEventThrottle={SCROLL_THROTTLE}
        contentContainerStyle={contentContainerStyle}
        nestedScrollEnabled
      >
        {items.map((item, index) => (
          <CarouselCard
            key={item.channelId}
            item={item}
            index={index}
            scrollX={scrollX}
            isActive={index === focusedIndex}
            zIndex={
              index === focusedIndex
                ? items.length + 1
                : items.length - Math.abs(index - focusedIndex)
            }
            onPress={handleCardPress}
          />
        ))}
      </Animated.ScrollView>

      {focusedLabel ? (
        <ThemedText style={styles.activeName} numberOfLines={1}>
          {focusedLabel}
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
    fontSize: 16,
    opacity: 0.85,
    paddingHorizontal: PADDING_LEFT,
    fontWeight: '500',
  },
});
