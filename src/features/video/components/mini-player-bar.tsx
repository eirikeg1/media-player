import { useRouter } from 'expo-router';
import { VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
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
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getChannelId } from '@/lib/channel-utils';
import { GlassColors } from '@/lib/theme';
import { useCastMiniPlayerStore } from '@/stores/video/cast-mini-player-store';
import {
  usePlaybackSessionStore,
  type PlaybackSession,
} from '@/stores/video/playback-session-store';
import type { Channel } from '@/types/playlist.types';
import type { ContentType } from '@/types/user.types';

const BAR_HEIGHT = 60;
const ANIMATION_DURATION = 250;

/**
 * The persistent bar above the tab bar that keeps playback around after the
 * video screen is closed. Two variants share the shell:
 * - **Local**: a minimized playback session — live video thumbnail attached to
 *   the still-playing session player, play/pause and close controls.
 * - **Cast**: an active Chromecast session — channel logo and remote controls.
 */
export function MiniPlayerBar() {
  const castChannel = useCastMiniPlayerStore((s) => s.channel);
  const session = usePlaybackSessionStore((s) => s.session);
  const localSession = !castChannel && session?.mode === 'mini' ? session : null;

  const isVisible = !!castChannel || !!localSession;
  const height = useSharedValue(0);

  // Animate in/out based on visibility
  useEffect(() => {
    height.value = withTiming(isVisible ? BAR_HEIGHT : 0, {
      duration: ANIMATION_DURATION,
    });
  }, [isVisible, height]);

  const animatedContainerStyle = useAnimatedStyle(() => ({
    height: height.value,
    overflow: 'hidden' as const,
  }));

  return (
    <Animated.View style={animatedContainerStyle}>
      {castChannel ? (
        <CastMiniContent channel={castChannel} />
      ) : localSession ? (
        <LocalMiniContent session={localSession} />
      ) : null}
    </Animated.View>
  );
}

/** Shared bar chrome: pressable row with themed glass background. */
function BarShell({ onPress, children }: { onPress: () => void; children: React.ReactNode }) {
  const colorScheme = useColorScheme();
  const glass = colorScheme === 'dark' ? GlassColors.dark : GlassColors.light;

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.bar,
        { backgroundColor: glass.surfaceElevated, borderTopColor: glass.border, borderTopWidth: 1 },
      ]}
    >
      {children}
    </Pressable>
  );
}

function ChannelLogo({ channel }: { channel: Channel }) {
  const colorScheme = useColorScheme();
  const glass = colorScheme === 'dark' ? GlassColors.dark : GlassColors.light;
  const iconColor = useThemeColor({}, 'icon');

  return channel.tvg?.logo ? (
    <Image source={{ uri: channel.tvg.logo }} style={styles.logo} />
  ) : (
    <View style={[styles.logoPlaceholder, { backgroundColor: glass.border }]}>
      <IconSymbol name="tv" size={20} color={iconColor} />
    </View>
  );
}

function LocalMiniContent({ session }: { session: PlaybackSession }) {
  const router = useRouter();
  const iconColor = useThemeColor({}, 'icon');
  const textColor = useThemeColor({}, 'text');
  const { player, channel } = session;

  const [isPlaying, setIsPlaying] = useState(player.playing);
  useEffect(() => {
    setIsPlaying(player.playing);
    const subscription = player.addListener('playingChange', ({ isPlaying: playing }) => {
      setIsPlaying(playing);
    });
    return () => subscription.remove();
  }, [player]);

  const handleExpand = () => {
    // Flip to fullscreen first so this bar's VideoView unmounts before the
    // screen attaches its own (Android allows one attached view per player).
    usePlaybackSessionStore.getState().expand();
    router.push({
      pathname: '/video-player',
      params: {
        channelId: getChannelId(channel),
        playlistId: session.playlistId,
        contentType: session.contentType,
        ...(session.fixture ? { fixture: JSON.stringify(session.fixture) } : {}),
      },
    });
  };

  const handleTogglePlayPause = () => {
    try {
      if (player.playing) {
        player.pause();
      } else {
        player.play();
      }
    } catch (error) {
      console.warn('[MiniPlayer] play/pause failed:', error);
    }
  };

  return (
    <BarShell onPress={handleExpand}>
      {session.screenViewAttached ? (
        // The screen's VideoView hasn't detached yet — show the logo for the
        // transition frame rather than double-attaching the player.
        <ChannelLogo channel={channel} />
      ) : (
        <View style={styles.thumbnail} pointerEvents="none">
          <VideoView
            player={player}
            style={StyleSheet.absoluteFill}
            nativeControls={false}
            contentFit="cover"
          />
        </View>
      )}

      <View style={styles.info}>
        <ThemedText numberOfLines={1} style={styles.channelName}>
          {channel.name}
        </ThemedText>
        <ThemedText numberOfLines={1} style={[styles.subtitle, { color: iconColor }]}>
          Tap to expand
        </ThemedText>
      </View>

      <Pressable onPress={handleTogglePlayPause} hitSlop={8} style={styles.controlButton}>
        <IconSymbol name={isPlaying ? 'pause.fill' : 'play.fill'} size={24} color={textColor} />
      </Pressable>

      <Pressable
        onPress={() => usePlaybackSessionStore.getState().endSession()}
        hitSlop={8}
        style={styles.controlButton}
      >
        <IconSymbol name="xmark" size={20} color={iconColor} />
      </Pressable>
    </BarShell>
  );
}

function CastMiniContent({ channel }: { channel: Channel }) {
  const router = useRouter();
  const iconColor = useThemeColor({}, 'icon');
  const textColor = useThemeColor({}, 'text');

  const playlistId = useCastMiniPlayerStore((s) => s.playlistId);
  const contentType = useCastMiniPlayerStore((s) => s.contentType);

  const client = useRemoteMediaClient();
  const castState = useCastState();
  const mediaStatus = useMediaStatus();

  const isCastPlaying =
    mediaStatus?.playerState === MediaPlayerState.PLAYING ||
    mediaStatus?.playerState === MediaPlayerState.BUFFERING;

  // Auto-dismiss when cast disconnects
  useEffect(() => {
    if (castState !== CastState.CONNECTED) {
      useCastMiniPlayerStore.getState().dismiss();
    }
  }, [castState]);

  const handleExpand = () => {
    if (!playlistId) return;
    router.push({
      pathname: '/video-player',
      params: {
        channelId: getChannelId(channel),
        playlistId,
        contentType: (contentType ?? 'live') satisfies ContentType,
      },
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
    <BarShell onPress={handleExpand}>
      <ChannelLogo channel={channel} />

      <View style={styles.info}>
        <ThemedText numberOfLines={1} style={styles.channelName}>
          {channel.name}
        </ThemedText>
        <ThemedText numberOfLines={1} style={[styles.subtitle, { color: iconColor }]}>
          Casting to TV
        </ThemedText>
      </View>

      <Pressable onPress={handleTogglePlayPause} hitSlop={8} style={styles.controlButton}>
        <IconSymbol name={isCastPlaying ? 'pause.fill' : 'play.fill'} size={24} color={textColor} />
      </Pressable>

      <Pressable onPress={handleClose} hitSlop={8} style={styles.controlButton}>
        <IconSymbol name="xmark" size={20} color={iconColor} />
      </Pressable>
    </BarShell>
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
  thumbnail: {
    width: 78,
    height: 44,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#000',
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
