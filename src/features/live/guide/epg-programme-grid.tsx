import { useThemeColor } from '@/hooks/use-theme-color';
import type { Channel } from '@/types/playlist.types';
import type { EpgProgramme } from 'expo-m3u-parser';
import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedScrollHandler,
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
}

function EpgProgrammeGridInner({
  channels,
  programmesByChannel,
  dayStartSeconds,
  nowSeconds,
  scrollX,
  scrollY,
  onProgrammePress,
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

  const renderChannelRow = useCallback(
    (channel: Channel, index: number) => {
      const tvgId = channel.tvg?.id ?? '';
      const programmes = programmesByChannel.get(tvgId) ?? [];

      return (
        <View
          key={`${channel.name}-${index}`}
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

  return (
    <Animated.ScrollView
      style={styles.container}
      horizontal
      bounces={false}
      showsHorizontalScrollIndicator={false}
      onScroll={horizontalScrollHandler}
      scrollEventThrottle={16}
    >
      <Animated.ScrollView
        style={{ width: DAY_WIDTH }}
        bounces={false}
        showsVerticalScrollIndicator={true}
        onScroll={verticalScrollHandler}
        scrollEventThrottle={16}
        nestedScrollEnabled
      >
        {channels.map(renderChannelRow)}
      </Animated.ScrollView>
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
});
