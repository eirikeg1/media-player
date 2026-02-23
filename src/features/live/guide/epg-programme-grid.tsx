import { useThemeColor } from '@/hooks/use-theme-color';
import type { Channel } from '@/types/playlist.types';
import type { EpgProgramme } from 'expo-m3u-parser';
import React, { useCallback, useEffect, useMemo } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { DAY_WIDTH, ROW_HEIGHT } from './epg-constants';
import { EpgProgrammeBlock } from './epg-programme-block';

interface EpgProgrammeGridProps {
  channels: Channel[];
  programmesByChannel: Map<string, EpgProgramme[]>;
  dayStartSeconds: number;
  nowSeconds: number;
  scrollX: SharedValue<number>;
  scrollY: SharedValue<number>;
  onProgrammePress: (programme: EpgProgramme) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
}

const AnimatedFlatList = Animated.FlatList as unknown as typeof Animated.FlatList<Channel>;

const SKELETON_ROWS = 25;
const ROW_PATTERNS: number[][] = [
  [120, 200, 80, 160],
  [80, 160, 120, 200],
  [200, 120, 160, 80],
  [160, 80, 200, 120],
  [120, 160, 200, 80],
  [80, 200, 120, 160],
  [200, 80, 160, 120],
  [160, 120, 80, 200],
  [120, 200, 160, 80],
  [80, 120, 200, 160],
];

function LoadingMoreSkeleton() {
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
    <View style={{ width: DAY_WIDTH }}>
      {Array.from({ length: SKELETON_ROWS }, (_, rowIdx) => (
        <View key={rowIdx} style={[styles.skeletonRow, { height: ROW_HEIGHT }]}>
          {ROW_PATTERNS[rowIdx % ROW_PATTERNS.length].map((width, blockIdx) => (
            <Animated.View
              key={blockIdx}
              style={[
                styles.skeletonBlock,
                { width, backgroundColor: placeholderColor },
                animatedStyle,
              ]}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

function EpgProgrammeGridInner({
  channels,
  programmesByChannel,
  dayStartSeconds,
  nowSeconds,
  scrollX,
  scrollY,
  onProgrammePress,
  onLoadMore,
  hasMore,
  isLoadingMore,
}: EpgProgrammeGridProps) {
  const borderColor = useThemeColor({ light: '#d0d0d0', dark: '#444' }, 'icon');

  // Outer horizontal scroll drives scrollX (syncs time header)
  const horizontalScrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
  });

  // Inner vertical scroll drives scrollY (syncs channel column)
  const verticalScrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const renderItem = useCallback(
    ({ item: channel, index }: { item: Channel; index: number }) => {
      const tvgId = channel.tvg?.id ?? '';
      const programmes = programmesByChannel.get(tvgId) ?? [];

      return (
        <View
          style={[styles.channelRow, { height: ROW_HEIGHT, borderBottomColor: borderColor }]}
        >
          {programmes.map((programme, pIdx) => {
            const isAiring =
              programme.start <= nowSeconds && programme.stop > nowSeconds;
            return (
              <EpgProgrammeBlock
                key={`${programme.channelId}-${programme.start}-${pIdx}`}
                programme={programme}
                dayStartSeconds={dayStartSeconds}
                isCurrentlyAiring={isAiring}
                onPress={onProgrammePress}
              />
            );
          })}
        </View>
      );
    },
    [programmesByChannel, dayStartSeconds, nowSeconds, onProgrammePress, borderColor]
  );

  const getItemLayout = useCallback(
    (_data: ArrayLike<Channel> | null | undefined, index: number) => ({
      length: ROW_HEIGHT,
      offset: ROW_HEIGHT * index,
      index,
    }),
    []
  );

  const keyExtractor = useCallback(
    (item: Channel, index: number) => `${item.name}-${index}`,
    []
  );

  const handleEndReached = useCallback(() => {
    if (hasMore && !isLoadingMore && onLoadMore) {
      onLoadMore();
    }
  }, [hasMore, isLoadingMore, onLoadMore]);

  const listFooter = useMemo(() => {
    if (!isLoadingMore) return undefined;
    return <LoadingMoreSkeleton />;
  }, [isLoadingMore]);

  return (
    <Animated.ScrollView
      style={styles.container}
      horizontal
      bounces={false}
      showsHorizontalScrollIndicator={false}
      onScroll={horizontalScrollHandler}
      scrollEventThrottle={16}
    >
      <AnimatedFlatList
        style={{ width: DAY_WIDTH }}
        data={channels}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemLayout={getItemLayout}
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews
        bounces={false}
        showsVerticalScrollIndicator
        onScroll={verticalScrollHandler}
        scrollEventThrottle={16}
        nestedScrollEnabled
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        ListFooterComponent={listFooter}
      />
    </Animated.ScrollView>
  );
}

export const EpgProgrammeGrid = React.memo(EpgProgrammeGridInner);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  channelRow: {
    position: 'relative',
    borderBottomWidth: 0.5,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: 'transparent',
  },
  skeletonBlock: {
    height: ROW_HEIGHT - 12,
    borderRadius: 4,
  },
});
