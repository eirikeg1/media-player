import type { PropsWithChildren, ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';

import { ThemedView } from '@/components/ui/display/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
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
}>;

export default function ParallaxScrollView({
  children,
  headerImage,
  headerBackgroundColor,
  stickyHeaderIndices,
  padding = 8,
  showsVerticalScrollIndicator = true,
}: Props) {
  const colorScheme = useColorScheme() ?? 'light';
  const insets = useSafeAreaInsets();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const { headerAnimatedStyle } = useParallaxHeader(scrollRef);

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
      >
        <View style={parallaxStyles.headerSpacer} />
        <ThemedView style={[styles.content, { padding }]}>{children}</ThemedView>
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
