import { SkeletonBlock, skeletonColor, useSkeletonPulse } from '@/components/ui/display/skeleton';
import { StyleSheet, useColorScheme, View } from 'react-native';
import { CHANNEL_COL_WIDTH, ROW_HEIGHT, SKELETON_ROW_PATTERNS, TIME_HEADER_HEIGHT } from './epg-constants';

const SKELETON_ROWS = 10;

export function EpgSkeleton() {
  const colorScheme = useColorScheme();
  const color = skeletonColor(colorScheme === 'dark');
  const pulse = useSkeletonPulse();

  return (
    <View style={styles.container}>
      {/* Time header skeleton */}
      <View style={styles.headerRow}>
        <SkeletonBlock
          width={CHANNEL_COL_WIDTH}
          height={24}
          color={color}
          pulse={pulse}
          style={styles.channelHeaderBlock}
        />
        <View style={styles.timeBlocks}>
          {[0, 1, 2, 3, 4].map((i) => (
            <SkeletonBlock key={i} width={50} height={14} borderRadius={3} color={color} pulse={pulse} />
          ))}
        </View>
      </View>

      {/* Channel rows */}
      {Array.from({ length: SKELETON_ROWS }, (_, rowIdx) => (
        <View key={rowIdx} style={styles.row}>
          {/* Channel column */}
          <SkeletonBlock
            width={CHANNEL_COL_WIDTH - 8}
            height={36}
            color={color}
            pulse={pulse}
            style={styles.channelBlock}
          />
          {/* Programme blocks */}
          <View style={styles.programmeRow}>
            {SKELETON_ROW_PATTERNS[rowIdx % SKELETON_ROW_PATTERNS.length].map((width, blockIdx) => (
              <SkeletonBlock
                key={blockIdx}
                width={width}
                height={ROW_HEIGHT - 12}
                color={color}
                pulse={pulse}
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
    margin: 4,
  },
  timeBlocks: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 8,
  },
  row: {
    flexDirection: 'row',
    height: ROW_HEIGHT,
    borderBottomWidth: 0.5,
    borderBottomColor: 'transparent',
  },
  channelBlock: {
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
});
