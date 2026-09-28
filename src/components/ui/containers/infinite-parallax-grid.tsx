import { useCallback, useMemo, type ReactElement } from 'react';
import { RefreshControl, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedRef, useAnimatedStyle } from 'react-native-reanimated';
import { FlashList, type ListRenderItem } from '@shopify/flash-list';

import { ThemedView } from '@/components/ui/display/themed-view';
import { useChromeInsets } from '@/hooks/use-chrome-insets';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { HEADER_BACKGROUND } from '@/lib/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  useParallaxHeader,
  INITIAL_SCROLL_OFFSET,
  PARALLAX_HEADER_HEIGHT,
  parallaxStyles,
} from './use-parallax-header';

const DEFAULT_COLUMNS = 3;
const DEFAULT_PADDING = 16;
const DEFAULT_GAP = 8;

interface InfiniteParallaxGridProps<T> {
  data: T[];
  renderItem: ListRenderItem<T>;
  keyExtractor: (item: T, index: number) => string;
  headerImage: ReactElement;
  /**
   * Fill behind {@link headerImage}. Defaults to {@link HEADER_BACKGROUND} — only
   * pass this for a header whose image genuinely needs a different backdrop.
   */
  headerBackgroundColor?: { dark: string; light: string };
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
  headerBackgroundColor = HEADER_BACKGROUND,
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
  const insets = useSafeAreaInsets();
  const chromeInsets = useChromeInsets();

  // Arrow color (dark arrow for light theme, theme color for dark theme)
  const refreshArrowColor = colorScheme === 'dark' ? tintColor : '#3d4560';
  // Background color (light gray for light theme, dark for dark theme)
  const refreshBackgroundColor = colorScheme === 'dark' ? '#1f2740' : '#dbe0ec';
  const scrollRef = useAnimatedRef<any>();
  const { scrollOffset, headerAnimatedStyle } = useParallaxHeader(scrollRef);

  const handleLoad = useCallback(() => {
    scrollRef.current?.scrollToOffset({ offset: INITIAL_SCROLL_OFFSET, animated: false });
  }, [scrollRef]);

  // Calculate item size for grid layout
  const { width: screenWidth } = useWindowDimensions();
  const itemWidth = (screenWidth - padding * 2 - gap * (columns - 1)) / columns;

  const backdropAnimatedStyle = useAnimatedStyle(() => {
    return {
      top: Math.max(PARALLAX_HEADER_HEIGHT + insets.top - scrollOffset.value, insets.top),
    };
  });

  const parallaxHeader = useMemo(
    () => (
      <View style={{ marginHorizontal: -padding }}>
        <View style={parallaxStyles.headerSpacer} />
        {ListHeaderComponentAfterParallax}
      </View>
    ),
    [ListHeaderComponentAfterParallax, padding]
  );

  // One style object per column instead of a fresh one per rendered cell.
  const columnStyles = useMemo(
    () =>
      Array.from({ length: columns }, (_, column) => ({
        width: itemWidth,
        marginRight: column === columns - 1 ? 0 : gap,
        marginBottom: gap,
      })),
    [columns, itemWidth, gap]
  );

  const wrappedRenderItem = useCallback<ListRenderItem<T>>(
    (info) => (
      <ThemedView style={columnStyles[info.index % columns]}>{renderItem(info)}</ThemedView>
    ),
    [columnStyles, columns, renderItem]
  );

  const contentContainerStyle = useMemo(
    () => ({ paddingHorizontal: padding, paddingBottom: padding + chromeInsets.bottom }),
    [padding, chromeInsets.bottom]
  );

  return (
    <ThemedView style={[parallaxStyles.container, { backgroundColor, paddingTop: insets.top }]}>
      <Animated.View
        style={[
          parallaxStyles.header,
          parallaxStyles.absoluteHeader,
          { backgroundColor: headerBackgroundColor[colorScheme] },
          headerAnimatedStyle,
        ]}
      >
        {headerImage}
      </Animated.View>
      {/* Opaque backdrop that tracks the boundary between header spacer and grid content */}
      <Animated.View style={[styles.headerBackdrop, { backgroundColor }, backdropAnimatedStyle]} />
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
        contentContainerStyle={contentContainerStyle}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        onLoad={handleLoad}
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
  headerBackdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
});
