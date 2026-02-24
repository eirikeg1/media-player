import { ThemedText } from '@/components/ui/display/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { isChannelFavorite } from '@/lib/channel-utils';
import type { Channel } from '@/types/playlist.types';
import { Image } from 'expo-image';
import React, { useCallback } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, {
  type SharedValue,
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
} from 'react-native-reanimated';
import { CHANNEL_COL_WIDTH, ROW_HEIGHT } from './epg-constants';

interface EpgChannelColumnProps {
  channels: Channel[];
  favoriteChannels: string[];
  scrollY: SharedValue<number>;
  onChannelPress: (channel: Channel) => void;
}

const AnimatedFlatList = Animated.FlatList as unknown as typeof Animated.FlatList<Channel>;

function EpgChannelColumnInner({
  channels,
  favoriteChannels,
  scrollY,
  onChannelPress,
}: EpgChannelColumnProps) {
  const borderColor = useThemeColor({ light: '#d0d0d0', dark: '#444' }, 'icon');
  const tintColor = useThemeColor({}, 'tint');

  const flatListRef = useAnimatedRef<Animated.FlatList<Channel>>();

  // Sync scroll position from the programme grid's scrollY
  useAnimatedReaction(
    () => scrollY.value,
    (current) => {
      scrollTo(flatListRef, 0, current, false);
    }
  );

  const renderItem = useCallback(
    ({ item: channel, index }: { item: Channel; index: number }) => {
      const isFav = isChannelFavorite(channel, favoriteChannels);
      return (
        <TouchableOpacity
          style={[styles.row, { borderBottomColor: borderColor }]}
          activeOpacity={0.7}
          onPress={() => onChannelPress(channel)}
        >
          {channel.tvg?.logo ? (
            <Image
              source={{ uri: channel.tvg.logo }}
              style={styles.logo}
              contentFit="contain"
            />
          ) : (
            <ThemedText numberOfLines={1} style={styles.channelName}>
              {channel.name}
            </ThemedText>
          )}
          {isFav && (
            <ThemedText style={[styles.starIndicator, { color: tintColor }]}>
              *
            </ThemedText>
          )}
        </TouchableOpacity>
      );
    },
    [favoriteChannels, borderColor, tintColor, onChannelPress]
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

  return (
    <View style={[styles.container, { borderRightColor: borderColor }]}>
      <AnimatedFlatList
        ref={flatListRef}
        data={channels}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemLayout={getItemLayout}
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

export const EpgChannelColumn = React.memo(EpgChannelColumnInner);

const styles = StyleSheet.create({
  container: {
    width: CHANNEL_COL_WIDTH,
    borderRightWidth: 1,
    overflow: 'hidden',
  },
  row: {
    height: ROW_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
  },
  logo: {
    width: CHANNEL_COL_WIDTH - 16,
    height: ROW_HEIGHT - 20,
  },
  channelName: {
    fontSize: 9,
    textAlign: 'center',
  },
  starIndicator: {
    position: 'absolute',
    top: 2,
    right: 4,
    fontSize: 10,
    fontWeight: '700',
  },
});
