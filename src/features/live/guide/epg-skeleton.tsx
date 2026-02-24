import { useEffect } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { CHANNEL_COL_WIDTH, ROW_HEIGHT, SKELETON_ROW_PATTERNS, TIME_HEADER_HEIGHT } from './epg-constants';

const SKELETON_ROWS = 10;

export function EpgSkeleton() {
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
    <View style={styles.container}>
      {/* Time header skeleton */}
      <View style={styles.headerRow}>
        <Animated.View
          style={[
            styles.channelHeaderBlock,
            { backgroundColor: placeholderColor },
            animatedStyle,
          ]}
        />
        <View style={styles.timeBlocks}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Animated.View
              key={i}
              style={[
                styles.timeBlock,
                { backgroundColor: placeholderColor },
                animatedStyle,
              ]}
            />
          ))}
        </View>
      </View>

      {/* Channel rows */}
      {Array.from({ length: SKELETON_ROWS }, (_, rowIdx) => (
        <View key={rowIdx} style={styles.row}>
          {/* Channel column */}
          <Animated.View
            style={[
              styles.channelBlock,
              { backgroundColor: placeholderColor },
              animatedStyle,
            ]}
          />
          {/* Programme blocks */}
          <View style={styles.programmeRow}>
            {SKELETON_ROW_PATTERNS[rowIdx % SKELETON_ROW_PATTERNS.length].map((width, blockIdx) => (
              <Animated.View
                key={blockIdx}
                style={[
                  styles.programmeBlock,
                  { width, backgroundColor: placeholderColor },
                  animatedStyle,
                ]}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 4,
  },
  headerRow: {
    flexDirection: 'row',
    height: TIME_HEADER_HEIGHT,
    marginBottom: 2,
  },
  channelHeaderBlock: {
    width: CHANNEL_COL_WIDTH,
    height: 24,
    borderRadius: 4,
    margin: 4,
  },
  timeBlocks: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 8,
  },
  timeBlock: {
    width: 50,
    height: 14,
    borderRadius: 3,
  },
  row: {
    flexDirection: 'row',
    height: ROW_HEIGHT,
    borderBottomWidth: 0.5,
    borderBottomColor: 'transparent',
  },
  channelBlock: {
    width: CHANNEL_COL_WIDTH - 8,
    height: 36,
    borderRadius: 4,
    margin: 4,
    alignSelf: 'center',
  },
  programmeRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 4,
  },
  programmeBlock: {
    height: ROW_HEIGHT - 12,
    borderRadius: 4,
  },
});
