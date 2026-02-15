import type { PropsWithChildren, ReactElement } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';

import { ThemedView } from '@/components/ui/display/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  useParallaxHeader,
  INITIAL_SCROLL_OFFSET,
  parallaxStyles,
} from './use-parallax-header';

type Props = PropsWithChildren<{
  headerImage: ReactElement;
  headerBackgroundColor: { dark: string; light: string };
  stickyHeaderIndices?: number[];
  padding?: number;
  showsVerticalScrollIndicator?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
}>;

export default function ParallaxScrollView({
  children,
  headerImage,
  headerBackgroundColor,
  stickyHeaderIndices,
  padding = 8,
  showsVerticalScrollIndicator = true,
  refreshing = false,
  onRefresh,
}: Props) {
  const colorScheme = useColorScheme() ?? 'light';
  const tintColor = useThemeColor({}, 'tint');
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const { headerAnimatedStyle } = useParallaxHeader(scrollRef);

  const refreshArrowColor = colorScheme === 'dark' ? tintColor : '#3d4560';
  const refreshBackgroundColor = colorScheme === 'dark' ? '#1f2740' : '#dbe0ec';

  return (
    <ThemedView style={[parallaxStyles.container, { paddingTop: insets.top }]}>
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
      <Animated.ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        scrollEventThrottle={16}
        stickyHeaderIndices={stickyHeaderIndices}
        contentOffset={{ x: 0, y: INITIAL_SCROLL_OFFSET }}
        showsVerticalScrollIndicator={showsVerticalScrollIndicator}
        nestedScrollEnabled
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
      >
        <View style={parallaxStyles.headerSpacer} />
        <ThemedView style={[styles.content, { padding, paddingBottom: padding + tabBarHeight }]}>{children}</ThemedView>
      </Animated.ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    gap: 16,
    overflow: 'hidden',
  },
});
