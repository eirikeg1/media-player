import type { PropsWithChildren, ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedRef,
  useAnimatedStyle,
  useScrollOffset,
} from 'react-native-reanimated';

import { ThemedView } from '@/components/ui/display/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const HEADER_HEIGHT = 250;

type Props = PropsWithChildren<{
  headerImage: ReactElement;
  headerBackgroundColor: { dark: string; light: string };
  stickyHeaderIndices?: number[];
}>;

export default function ParallaxScrollView({
  children,
  headerImage,
  headerBackgroundColor,
  stickyHeaderIndices,
}: Props) {
  const colorScheme = useColorScheme() ?? 'light';
  const insets = useSafeAreaInsets();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollOffset = useScrollOffset(scrollRef);
  const headerAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          translateY: interpolate(
            scrollOffset.value,
            [-HEADER_HEIGHT, 0, HEADER_HEIGHT],
            [HEADER_HEIGHT / 2, 0, -HEADER_HEIGHT / 4]
          ),
        },
        {
          scale: interpolate(scrollOffset.value, [-HEADER_HEIGHT, 0, HEADER_HEIGHT], [2, 1, 1]),
        },
      ],
    };
  });

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <Animated.View
        style={[
          styles.header,
          styles.absoluteHeader,
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
      >
        <View style={styles.headerSpacer} />
        <ThemedView style={styles.content}>{children}</ThemedView>
      </Animated.ScrollView>
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
  absoluteHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 0,
  },
  headerSpacer: {
    height: HEADER_HEIGHT,
  },
  content: {
    flex: 1,
    padding: 8,
    gap: 16,
    overflow: 'hidden',
  },
});
