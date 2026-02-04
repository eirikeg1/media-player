import { useMemo, type ReactElement } from 'react';
import { Dimensions, RefreshControl, StyleSheet } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedRef,
  useAnimatedStyle,
  useScrollOffset,
} from 'react-native-reanimated';
import { FlashList, type ListRenderItem } from '@shopify/flash-list';

import { ThemedView } from '@/components/ui/display/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeColor } from '@/hooks/use-theme-color';

const HEADER_HEIGHT = 250;
const DEFAULT_COLUMNS = 3;
const DEFAULT_PADDING = 16;
const DEFAULT_GAP = 8;

interface InfiniteParallaxGridProps<T> {
  data: T[];
  renderItem: ListRenderItem<T>;
  keyExtractor: (item: T, index: number) => string;
  headerImage: ReactElement;
  headerBackgroundColor: { dark: string; light: string };
  columns?: number;
  onEndReached?: () => void;
  onEndReachedThreshold?: number;
  ListEmptyComponent?: ReactElement;
  ListFooterComponent?: ReactElement;
  ListHeaderComponentAfterParallax?: ReactElement;
  padding?: number;
  gap?: number;
  refreshing?: boolean;
  onRefresh?: () => void;
}

export default function InfiniteParallaxGrid<T>({
  data,
  renderItem,
  keyExtractor,
  headerImage,
  headerBackgroundColor,
  columns = DEFAULT_COLUMNS,
  onEndReached,
  onEndReachedThreshold = 0.1,
  ListEmptyComponent,
  ListFooterComponent,
  ListHeaderComponentAfterParallax,
  padding = DEFAULT_PADDING,
  gap = DEFAULT_GAP,
  refreshing = false,
  onRefresh,
}: InfiniteParallaxGridProps<T>) {
  const backgroundColor = useThemeColor({}, 'background');
  const tintColor = useThemeColor({}, 'tint');
  const colorScheme = useColorScheme() ?? 'light';

  // Arrow color (dark arrow for light theme, theme color for dark theme)
  const refreshArrowColor = colorScheme === 'dark' ? tintColor : '#333333';
  // Background color (light gray for light theme, dark for dark theme)
  const refreshBackgroundColor = colorScheme === 'dark' ? '#444444' : '#E5E5E5';
  const scrollRef = useAnimatedRef<any>();
  const scrollOffset = useScrollOffset(scrollRef);

  // Calculate item size for grid layout
  const { width: screenWidth } = Dimensions.get('window');
  const itemWidth = (screenWidth - padding * 2 - gap * (columns - 1)) / columns;

  const headerAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          translateY: interpolate(
            scrollOffset.value,
            [-HEADER_HEIGHT, 0, HEADER_HEIGHT],
            [-HEADER_HEIGHT / 2, 0, HEADER_HEIGHT * 0.75]
          ),
        },
        {
          scale: interpolate(
            scrollOffset.value,
            [-HEADER_HEIGHT, 0, HEADER_HEIGHT],
            [2, 1, 1]
          ),
        },
      ],
    };
  });

  const parallaxHeader = useMemo(
    () => (
      <>
        <Animated.View
          style={[
            styles.header,
            { backgroundColor: headerBackgroundColor[colorScheme] },
            headerAnimatedStyle,
          ]}
        >
          {headerImage}
        </Animated.View>
        {ListHeaderComponentAfterParallax}
      </>
    ),
    [colorScheme, headerBackgroundColor, headerAnimatedStyle, headerImage, ListHeaderComponentAfterParallax]
  );

  const wrappedRenderItem: ListRenderItem<T> = (info) => {
    const { index } = info;
    const renderedItem = renderItem(info);

    return (
      <ThemedView
        style={[
          styles.gridItem,
          {
            width: itemWidth,
            marginRight: (index + 1) % columns === 0 ? 0 : gap,
            marginBottom: gap,
          },
        ]}
      >
        {renderedItem}
      </ThemedView>
    );
  };

  return (
    <ThemedView style={[styles.container, { backgroundColor }]}>
      <FlashList
        ref={scrollRef}
        data={data}
        renderItem={wrappedRenderItem}
        keyExtractor={keyExtractor}
        numColumns={columns}
        ListHeaderComponent={parallaxHeader}
        ListEmptyComponent={ListEmptyComponent}
        ListFooterComponent={ListFooterComponent}
        onEndReached={onEndReached}
        onEndReachedThreshold={onEndReachedThreshold}
        contentContainerStyle={{
          paddingHorizontal: padding,
          paddingBottom: padding,
        }}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={refreshArrowColor}
              colors={[refreshArrowColor]}
              progressBackgroundColor={refreshBackgroundColor}
            />
          ) : undefined
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    height: HEADER_HEIGHT,
    overflow: 'hidden',
  },
  gridItem: {
    // Dynamic width and margins applied inline
  },
});
