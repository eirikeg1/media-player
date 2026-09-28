import { BlurView } from 'expo-blur';
import { usePathname, useRouter, type Href } from 'expo-router';
import { VideoView } from 'expo-video';
import { useEffect } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { fixtureRouteParam } from '@/features/sports/fixture-param';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getChannelId } from '@/lib/channel-utils';
import { hrefParam } from '@/lib/route-params';
import { GlassColors } from '@/lib/theme';
import { useTabBarStore } from '@/stores/app';
import { useCastMiniPlayerStore } from '@/stores/video/cast-mini-player-store';
import {
  usePlaybackSessionStore,
  type PlaybackSession,
} from '@/stores/video/playback-session-store';
import { usePlaybackTimeStore } from '@/stores/video/playback-time-store';
import type { CatchupWindow } from '@/types/playback.types';
import type { Channel } from '@/types/playlist.types';
import type { ContentType } from '@/types/user.types';

const BAR_HEIGHT = 60;
const ANIMATION_DURATION = 250;

/** The full-screen player, which is the one route the bar must never cover. */
const PLAYER_PATHNAME = '/video-player';

/** Route params that re-open the video screen on a catch-up window (none when live). */
function catchupParams(catchup: CatchupWindow | null): Record<string, string> {
  if (!catchup) return {};
  return {
    catchupStart: String(catchup.start),
    catchupDuration: String(catchup.durationMinutes),
  };
}

/**
 * The persistent bar that keeps playback around after the video screen is
 * closed. Two variants share the shell:
 * - **Local**: a minimized playback session — live video thumbnail attached to
 *   the still-playing session player, play/pause and close controls.
 * - **Cast**: an active Chromecast session — channel logo and remote controls.
 *
 * Rendered once by the root layout, over the whole stack, because minimizing
 * the player leaves the viewer on whatever route launched it — a detail sheet
 * as often as a tab. It docks itself on top of the tab bar while the tab group
 * is on screen and at the safe-area edge everywhere else, and stays out of the
 * way of the full-screen player.
 */
export function MiniPlayerBar() {
  const castChannel = useCastMiniPlayerStore((s) => s.channel);
  const session = usePlaybackSessionStore((s) => s.session);
  const localSession = !castChannel && session?.mode === 'mini' ? session : null;

  // Over the whole stack now, so the player route has to be excluded by name:
  // minimizing flips the session before the pop is dispatched, which would
  // otherwise grow the bar over a video still filling the screen.
  const onPlayerRoute = usePathname() === PLAYER_PATHNAME;
  const isVisible = !onPlayerRoute && (!!castChannel || !!localSession);
  const dockOffset = useDockOffset();
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
    // `box-none`: the wrapper spans the width of the screen, and the tab bar
    // underneath it has to stay pressable outside the bar's own rect.
    <View
      testID="mini-player-dock"
      style={[styles.dock, { bottom: dockOffset }]}
      pointerEvents="box-none"
    >
      <Animated.View style={animatedContainerStyle}>
        {!isVisible ? null : castChannel ? (
          <CastMiniContent channel={castChannel} />
        ) : localSession ? (
          <LocalMiniContent session={localSession} />
        ) : null}
      </Animated.View>
    </View>
  );
}

/**
 * How far above the bottom edge the bar sits: directly on top of the tab bar
 * inside the tab group, clear of the home indicator anywhere else. Both facts
 * are published by the tab layout, which is the only place that knows them —
 * this bar lives outside the tab navigator (see `useTabBarStore`).
 */
function useDockOffset(): number {
  const tabBarHeight = useTabBarStore((s) => s.height);
  const isTabRouteFocused = useTabBarStore((s) => s.isTabRouteFocused);
  const insets = useSafeAreaInsets();
  return isTabRouteFocused ? tabBarHeight : insets.bottom;
}

/**
 * The bar's glass palette, with the scheme it came from: the blur's `tint` has
 * to follow the same scheme as the colours painted over it.
 */
function useGlass() {
  const isDark = useColorScheme() === 'dark';
  return { glass: isDark ? GlassColors.dark : GlassColors.light, isDark };
}

/**
 * Shared bar chrome: a pressable row over a frosted background.
 *
 * The blur is a real `BlurView` — the same treatment the tab bar this sits on
 * uses, Android included — under a nearly opaque tint, so what scrolls behind
 * the bar reads as a soft wash instead of showing through it. It is the first
 * child, so paint order alone keeps the row's content above it.
 */
function BarShell({ onPress, children }: { onPress: () => void; children: React.ReactNode }) {
  const { glass, isDark } = useGlass();

  return (
    <Pressable onPress={onPress} style={[styles.bar, { borderTopColor: glass.border }]}>
      <BlurView
        intensity={glass.chromeBlur}
        tint={isDark ? 'dark' : 'light'}
        style={[StyleSheet.absoluteFill, { backgroundColor: glass.surfaceFrosted }]}
      />
      {children}
    </Pressable>
  );
}

function ChannelLogo({ channel }: { channel: Channel }) {
  const { glass } = useGlass();
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
  const pathname = usePathname();
  const iconColor = useThemeColor({}, 'icon');
  const textColor = useThemeColor({}, 'text');
  const { glass } = useGlass();
  const { player, channel, error } = session;

  // Published by PlaybackSessionHost, which is the only subscriber to the
  // player's `playingChange` — this bar and the video screen both read it here.
  const isPlaying = usePlaybackTimeStore((s) => s.isPlaying);

  const handleExpand = () => {
    // Flip to fullscreen first so this bar's VideoView unmounts before the
    // screen attaches its own (Android allows one attached view per player).
    usePlaybackSessionStore.getState().expand();

    // Put the surface playback was launched from back underneath the player, so
    // backing out of it lands on the title rather than on whatever tab the
    // viewer wandered off to. `navigate` rather than `push`: expanding straight
    // from that surface (minimize leaves you standing on it) must not stack a
    // second copy of it, and a surface already open on another title is simply
    // re-pointed at this one.
    const origin = session.origin;
    if (origin && !isOnOrigin(pathname, origin)) router.navigate(origin);

    router.push({
      pathname: PLAYER_PATHNAME,
      params: {
        channelId: getChannelId(channel),
        playlistId: session.playlistId,
        contentType: session.contentType,
        ...(origin ? { origin: hrefParam.encode(origin) } : {}),
        ...(session.fixture ? { fixture: fixtureRouteParam(session.fixture) } : {}),
        ...catchupParams(session.catchup),
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
    } catch (err) {
      console.warn('[MiniPlayer] play/pause failed:', err);
    }
  };

  // A stream can fail with no video screen mounted to notice; the session
  // records it, and this is where the viewer finds out — with the two ways out
  // (reload, close) the error card on the screen offers.
  if (error) {
    return (
      <BarShell onPress={handleExpand}>
        <View style={[styles.logoPlaceholder, { backgroundColor: glass.border }]}>
          <IconSymbol name="exclamationmark.triangle" size={20} color={iconColor} />
        </View>

        <View style={styles.info}>
          <ThemedText numberOfLines={1} style={styles.channelName}>
            {channel.name}
          </ThemedText>
          <ThemedText numberOfLines={1} style={[styles.subtitle, { color: iconColor }]}>
            {error.title}
          </ThemedText>
        </View>

        <Pressable
          onPress={() => void usePlaybackSessionStore.getState().reloadSource()}
          hitSlop={8}
          style={styles.controlButton}
          accessibilityRole="button"
          accessibilityLabel="Reload stream"
        >
          <IconSymbol name="arrow.clockwise" size={22} color={textColor} />
        </Pressable>

        <Pressable
          onPress={() => usePlaybackSessionStore.getState().endSession()}
          hitSlop={8}
          style={styles.controlButton}
          accessibilityRole="button"
          accessibilityLabel="Close player"
        >
          <IconSymbol name="xmark" size={20} color={iconColor} />
        </Pressable>
      </BarShell>
    );
  }

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

/**
 * Whether the route on screen is already the session's launch origin.
 *
 * Compared by pathname alone: the parameters that tell two channel sheets apart
 * are serialised records, and `navigate` re-points an open surface at the right
 * title anyway — this only has to recognise that there is one to re-point.
 */
function isOnOrigin(pathname: string, origin: Href): boolean {
  return typeof origin === 'object' && origin.pathname === pathname;
}

function CastMiniContent({ channel }: { channel: Channel }) {
  const router = useRouter();
  const iconColor = useThemeColor({}, 'icon');
  const textColor = useThemeColor({}, 'text');

  const playlistId = useCastMiniPlayerStore((s) => s.playlistId);
  const contentType = useCastMiniPlayerStore((s) => s.contentType);
  const catchup = useCastMiniPlayerStore((s) => s.catchup);

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
      pathname: PLAYER_PATHNAME,
      params: {
        channelId: getChannelId(channel),
        playlistId,
        contentType: (contentType ?? 'live') satisfies ContentType,
        ...catchupParams(catchup),
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
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  bar: {
    height: BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderTopWidth: 1,
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
