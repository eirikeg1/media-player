import { ThemedText } from '@/components/ui/display/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { isChannelFavorite } from '@/lib/channel-utils';
import type { Channel } from '@/types/playlist.types';
import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { CHANNEL_COL_WIDTH, ROW_HEIGHT } from './epg-constants';

interface EpgChannelColumnProps {
  channels: Channel[];
  favoriteChannels: string[];
  scrollY: SharedValue<number>;
  onChannelPress: (channel: Channel) => void;
}

function EpgChannelColumnInner({
  channels,
  favoriteChannels,
  scrollY,
  onChannelPress,
}: EpgChannelColumnProps) {
  const borderColor = useThemeColor({ light: '#d0d0d0', dark: '#444' }, 'icon');
  const tintColor = useThemeColor({}, 'tint');

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -scrollY.value }],
  }));

  return (
    <View style={[styles.container, { borderRightColor: borderColor }]}>
      <Animated.View style={animatedStyle}>
        {channels.map((channel, index) => {
          const isFav = isChannelFavorite(channel, favoriteChannels);
          return (
            <TouchableOpacity
              key={`${channel.name}-${index}`}
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
        })}
      </Animated.View>
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
