import { StyleSheet } from 'react-native';
import { interpolate, useAnimatedStyle, useScrollOffset } from 'react-native-reanimated';

export const PARALLAX_HEADER_HEIGHT = 250;
export const INITIAL_SCROLL_OFFSET = 80;

export function useParallaxHeader(scrollRef: any) {
  const scrollOffset = useScrollOffset(scrollRef);

  const headerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          scrollOffset.value,
          [-PARALLAX_HEADER_HEIGHT, 0, PARALLAX_HEADER_HEIGHT],
          [PARALLAX_HEADER_HEIGHT / 2, 0, -PARALLAX_HEADER_HEIGHT / 4]
        ),
      },
      {
        scale: interpolate(
          scrollOffset.value,
          [-PARALLAX_HEADER_HEIGHT, 0, PARALLAX_HEADER_HEIGHT],
          [2, 1, 1]
        ),
      },
    ],
  }));

  return { scrollOffset, headerAnimatedStyle };
}

export const parallaxStyles = StyleSheet.create({
  container: { flex: 1 },
  header: { height: PARALLAX_HEADER_HEIGHT, overflow: 'hidden' },
  absoluteHeader: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 0 },
  headerSpacer: { height: PARALLAX_HEADER_HEIGHT },
});
