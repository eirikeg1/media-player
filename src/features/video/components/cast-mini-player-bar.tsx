import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import {
  CastState,
  MediaPlayerState,
  useCastState,
  useMediaStatus,
  useRemoteMediaClient,
} from 'react-native-google-cast';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { ThemedText } from '@/components/ui/display/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getChannelId } from '@/lib/channel-utils';
import { useCastMiniPlayerStore } from '@/stores/video/cast-mini-player-store';

const BAR_HEIGHT = 60;
const ANIMATION_DURATION = 250;

export function CastMiniPlayerBar() {
  const router = useRouter();
  const channel = useCastMiniPlayerStore((s) => s.channel);
  const playlistId = useCastMiniPlayerStore((s) => s.playlistId);

  const client = useRemoteMediaClient();
  const castState = useCastState();
  const mediaStatus = useMediaStatus();

  const backgroundColor = useThemeColor({}, 'background');
  const borderColor = useThemeColor({ light: '#e0e0e0', dark: '#333' }, 'background');
  const iconColor = useThemeColor({}, 'icon');
  const textColor = useThemeColor({}, 'text');

  const isCastPlaying =
    mediaStatus?.playerState === MediaPlayerState.PLAYING ||
    mediaStatus?.playerState === MediaPlayerState.BUFFERING;

  const isVisible = channel !== null;
  const height = useSharedValue(0);

  // Animate in/out based on visibility
  useEffect(() => {
    height.value = withTiming(isVisible ? BAR_HEIGHT : 0, {
      duration: ANIMATION_DURATION,
    });
  }, [isVisible, height]);

  // Auto-dismiss when cast disconnects
  useEffect(() => {
    if (isVisible && castState !== CastState.CONNECTED) {
      useCastMiniPlayerStore.getState().dismiss();
    }
  }, [castState, isVisible]);

  const animatedContainerStyle = useAnimatedStyle(() => ({
    height: height.value,
    overflow: 'hidden' as const,
  }));

  const handleExpand = () => {
    if (!channel || !playlistId) return;
    router.push({
      pathname: '/video-player',
      params: { channelId: getChannelId(channel), playlistId },
    });
  };

  const handleTogglePlayPause = async () => {
    if (!client) return;
    try {
      if (isCastPlaying) {
        await client.pause();
      } else {
        await client.play();
      }
    } catch (error) {
      console.warn('[CastMiniPlayer] play/pause failed:', error);
    }
  };

  const handleClose = async () => {
    if (client) {
      try {
        await client.stop();
      } catch (error) {
        console.warn('[CastMiniPlayer] stop failed:', error);
      }
    }
    useCastMiniPlayerStore.getState().dismiss();
  };

  return (
    <Animated.View style={animatedContainerStyle}>
      <Pressable
        onPress={handleExpand}
        style={[
          styles.bar,
          { backgroundColor, borderTopColor: borderColor, borderWidth: 2 },
        ]}
      >
        {channel?.tvg.logo ? (
          <Image source={{ uri: channel.tvg.logo }} style={styles.logo} />
        ) : (
          <View style={[styles.logoPlaceholder, { backgroundColor: borderColor }]}>
            <IconSymbol name="tv" size={20} color={iconColor} />
          </View>
        )}

        <View style={styles.info}>
          <ThemedText numberOfLines={1} style={styles.channelName}>
            {channel?.name}
          </ThemedText>
          <ThemedText
            numberOfLines={1}
            style={[styles.subtitle, { color: iconColor }]}
          >
            Casting to TV
          </ThemedText>
        </View>

        <Pressable
          onPress={handleTogglePlayPause}
          hitSlop={8}
          style={styles.controlButton}
        >
          <IconSymbol
            name={isCastPlaying ? 'pause.fill' : 'play.fill'}
            size={24}
            color={textColor}
          />
        </Pressable>

        <Pressable
          onPress={handleClose}
          hitSlop={8}
          style={styles.controlButton}
        >
          <IconSymbol name="xmark" size={20} color={iconColor} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 6,
  },
  logoPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: {
    flex: 1,
    marginLeft: 10,
    marginRight: 8,
  },
  channelName: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  controlButton: {
    padding: 8,
  },
});
