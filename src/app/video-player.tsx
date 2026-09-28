import type { Fixture } from 'expo-m3u-parser';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, StatusBar, View } from 'react-native';

import { ConfirmDialog } from '@/components/ui/containers/modal/confirm-dialog';
import { shouldHandOverToLive } from '@/features/sports/catchup';
import { parseFixtureParam } from '@/features/sports/fixture-param';
import { VIDEO_COLORS } from '@/features/video/constants';
import { VideoPlayer } from '@/features/video/components/video-player';
import { VideoStateButton } from '@/features/video/components/video-states';
import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { ThemedText } from '@/components/ui/display/themed-text';
import { firstVisibleTabHref } from '@/features/user/visible-tabs';
import { getChannelId } from '@/lib/channel-utils';
import { hrefParam } from '@/lib/route-params';
import { RustChannelService } from '@/services/rust-channel-service';
import { useCastMiniPlayerStore } from '@/stores/video/cast-mini-player-store';
import { useUserStore } from '@/stores/user/user-store';
import { useGestureStore } from '@/stores/video/gesture-store';
import {
  sessionMatches,
  usePlaybackSessionStore,
} from '@/stores/video/playback-session-store';
import { useVideoPlayerStore } from '@/stores/video/player-store';
import { usePlaybackQueueStore, type QueueHandover } from '@/stores/video/queue-store';
import { parseCatchupParams } from '@/types/playback.types';
import type { Channel } from '@/types/playlist.types';
import type { ContentType } from '@/types/user.types';

function formatPosition(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export default function VideoPlayerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    channelId: string;
    playlistId: string;
    contentType: string;
    fixture?: string;
    catchupStart?: string;
    catchupDuration?: string;
    origin?: string;
  }>();
  const contentType = (params.contentType as ContentType) || 'live';

  // Sports catch-up launches carry the archive window to play instead of the
  // channel's live stream. A malformed pair simply means live playback.
  const catchup = useMemo(
    () => parseCatchupParams(params.catchupStart, params.catchupDuration),
    [params.catchupStart, params.catchupDuration]
  );

  // Sports launches pass the associated fixture (serialised) so the player can
  // surface SofaScore match widgets. Validated, not cast: see `fixture-param`.
  const fixture = useMemo<Fixture | null>(
    () => parseFixtureParam(params.fixture),
    [params.fixture]
  );

  // The surface playback was launched from, carried on the session so the mini
  // bar can put it back underneath the player when it expands. Validated, not
  // cast: see `route-params`.
  const origin = useMemo(() => hrefParam.decode(params.origin), [params.origin]);

  const stopVideoRef = useRef<(() => void) | null>(null);

  // Whether the mini bar's session already plays this exact channel
  // (expanding). Adopted launches reuse the session's channel and skip the
  // resume prompt so playback continues seamlessly; consumed on first use so
  // later in-screen channel switches behave normally.
  const adoptedRef = useRef(
    !!params.channelId &&
      !!params.playlistId &&
      sessionMatches(usePlaybackSessionStore.getState().session, {
        channelId: params.channelId,
        playlistId: params.playlistId,
        catchup,
      })
  );

  // The queue this session navigates with. Taken once from the launching
  // screen's handover, then carried across in-screen channel switches — a
  // launch that staged nothing plays with no queue rather than inheriting the
  // previous session's (which is how next/previous used to jump from a movie
  // into a list of live channels).
  //
  // Guarded rather than passed to `useRef`, whose argument is evaluated on
  // every render: taking the handover is a *consuming* read, so a queue staged
  // while this screen is mounted would be swallowed by an unrelated re-render.
  const queueRef = useRef<QueueHandover | null>(null);
  const hasTakenQueueRef = useRef(false);
  if (!hasTakenQueueRef.current) {
    hasTakenQueueRef.current = true;
    queueRef.current = usePlaybackQueueStore.getState().takeStagedQueue(params.channelId);
  }

  // Look up channel from route params
  const [channel, setChannel] = useState<Channel | null>(null);
  const [isLoadingChannel, setIsLoadingChannel] = useState(true);

  // The archive URL for a catch-up window. Null once resolved means the panel
  // has no such archive. Live playback needs no resolution at all — see below.
  const [catchupUrl, setCatchupUrl] = useState<string | null>(null);
  const [isResolvingCatchup, setIsResolvingCatchup] = useState(!!catchup);

  // Resume playback state
  const [startPosition, setStartPosition] = useState(0);
  const [isResumeResolved, setIsResumeResolved] = useState(false);
  const [resumeDialogData, setResumeDialogData] = useState<{ position: number } | null>(null);

  /**
   * What is actually played, known synchronously for live playback: the
   * channel's own URL. Deriving it instead of holding it in state is what lets
   * a catch-up window hand over to live — a state value still holding the
   * archive URL made the session look like a match, so the screen expanded the
   * finished window instead of starting the live stream.
   */
  const streamUrl = useMemo(() => {
    if (!channel) return null;
    return catchup ? catchupUrl : channel.url;
  }, [channel, catchup, catchupUrl]);

  // Dismiss the cast mini bar when this screen mounts (expanding from bar or new channel)
  useEffect(() => {
    useCastMiniPlayerStore.getState().dismiss();
  }, []);

  // Reset stores not covered by the orchestrator's unmount cleanup. The
  // playback queue is NOT reset here — it belongs to the session (so
  // next/previous survive minimize → expand) and is replaced by startSession.
  useEffect(() => {
    useGestureStore.getState().reset();
  }, []);

  // Playback queue navigation
  const queueHasNavigation = usePlaybackQueueStore(s => s.channels.length > 1);
  const hasNavigation = queueHasNavigation && contentType !== 'movie';

  const handleChannelSwitch = useCallback((newChannel: Channel, queue: QueueHandover) => {
    stopVideoRef.current?.();
    queueRef.current = queue;
    setStartPosition(0);
    setIsResumeResolved(false);
    setResumeDialogData(null);
    setCatchupUrl(null);
    setChannel(newChannel);
    setIsLoadingChannel(false);
  }, []);

  const goToQueueChannel = useCallback(
    (direction: 'next' | 'previous') => {
      const queue = usePlaybackQueueStore.getState();
      const newChannel = direction === 'next' ? queue.goNext() : queue.goPrevious();
      if (!newChannel) return;
      // Read back after the move: the new session has to be started with the
      // queue *and* the index it just landed on, or navigating once would clear
      // the queue that made it possible.
      const { channels, currentIndex } = usePlaybackQueueStore.getState();
      handleChannelSwitch(newChannel, { channels, index: currentIndex });
    },
    [handleChannelSwitch]
  );

  const handleNext = useCallback(() => goToQueueChannel('next'), [goToQueueChannel]);
  const handlePrevious = useCallback(() => goToQueueChannel('previous'), [goToQueueChannel]);

  useEffect(() => {
    if (!params.channelId || !params.playlistId) {
      // Nothing to play and nothing to wait for: fall through to the "Invalid
      // Channel" layout instead of sitting on the loading screen forever.
      setIsLoadingChannel(false);
      setIsResolvingCatchup(false);
      setIsResumeResolved(true);
      return;
    }

    // Expanding from the mini bar: the session already holds the channel.
    const session = usePlaybackSessionStore.getState().session;
    if (adoptedRef.current && session) {
      setChannel(session.channel);
      setIsLoadingChannel(false);
      return;
    }

    let cancelled = false;
    RustChannelService.getChannelById(params.playlistId, params.channelId)
      .then((loaded) => {
        if (!cancelled) setChannel(loaded);
      })
      .catch((error) => {
        console.error('Failed to load channel:', error);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingChannel(false);
      });

    return () => {
      cancelled = true;
    };
  }, [params.channelId, params.playlistId]);

  // Resolve the catch-up window into a panel archive URL, which only Xtream
  // playlists can serve (null otherwise — see the error layout below).
  useEffect(() => {
    if (!channel || isLoadingChannel || !catchup) return;

    // Expanding from the mini bar: the session already holds the archive URL.
    const session = usePlaybackSessionStore.getState().session;
    if (adoptedRef.current && session) {
      setCatchupUrl(session.streamUrl);
      setIsResolvingCatchup(false);
      return;
    }

    let cancelled = false;
    setIsResolvingCatchup(true);
    RustChannelService.getCatchupStreamUrl(
      params.playlistId,
      getChannelId(channel),
      catchup.start,
      catchup.durationMinutes
    )
      .then((url) => {
        if (!cancelled) setCatchupUrl(url);
      })
      .catch((error) => {
        console.error('Failed to resolve catch-up stream:', error);
      })
      .finally(() => {
        if (!cancelled) setIsResolvingCatchup(false);
      });

    return () => {
      cancelled = true;
    };
  }, [channel, isLoadingChannel, catchup, params.playlistId]);

  // Check for saved position to prompt resume
  useEffect(() => {
    if (!channel || isLoadingChannel) return;

    // An adopted session is already at the right position — never re-prompt.
    if (adoptedRef.current) {
      adoptedRef.current = false;
      setIsResumeResolved(true);
      return;
    }

    if (contentType === 'live') {
      setIsResumeResolved(true);
      return;
    }

    const userId = useUserStore.getState().currentUser?.id;
    if (!userId || !params.playlistId) {
      setIsResumeResolved(true);
      return;
    }

    let cancelled = false;
    const channelId = getChannelId(channel);
    useUserStore.getState().getSavedPosition(userId, params.playlistId, channelId)
      .then((saved) => {
        if (cancelled) return;
        if (!saved) {
          setIsResumeResolved(true);
          return;
        }
        setResumeDialogData({ position: saved.lastPosition });
      })
      .catch(() => {
        if (!cancelled) setIsResumeResolved(true);
      });

    return () => {
      cancelled = true;
    };
  }, [channel, isLoadingChannel, contentType, params.playlistId]);

  // Start (or adopt) the app-wide playback session once the channel and
  // resume position are known. Also runs on in-screen channel switches
  // (queue next/previous), replacing the session for the new channel.
  useEffect(() => {
    if (!channel || !isResumeResolved || !streamUrl || !params.playlistId) return;
    const store = usePlaybackSessionStore.getState();
    const target = {
      channelId: getChannelId(channel),
      playlistId: params.playlistId,
      catchup,
      streamUrl,
    };
    if (sessionMatches(store.session, target)) {
      store.expand();
      return;
    }
    store.startSession({
      channel,
      playlistId: params.playlistId,
      contentType,
      fixture,
      origin,
      startPosition,
      streamUrl,
      catchup,
      queue: queueRef.current,
    });
  }, [channel, isResumeResolved, streamUrl, catchup, params.playlistId, contentType, fixture, origin, startPosition]);

  // Hand a catch-up window over to the live stream when it runs out. The panel
  // fixes the archive file's length at request time, so a window over a match
  // still in play ends at the recording edge rather than at the final whistle —
  // the rest of the match is only on the live stream. Re-opening this route
  // without the catch-up params resolves the channel's own URL and starts a
  // live session through the normal path.
  const sessionPlayer = usePlaybackSessionStore((s) => s.session?.player ?? null);
  useEffect(() => {
    if (!sessionPlayer || !shouldHandOverToLive(catchup, fixture)) return;

    const subscription = sessionPlayer.addListener('playToEnd', () => {
      router.replace({
        pathname: '/video-player',
        params: {
          channelId: params.channelId,
          playlistId: params.playlistId,
          contentType,
          ...(params.fixture ? { fixture: params.fixture } : {}),
          // The launch origin outlives the hand-over: the surface the viewer
          // came from is the same one whether they watch the archive or live.
          ...(params.origin ? { origin: params.origin } : {}),
        },
      });
    });

    return () => subscription.remove();
  }, [
    sessionPlayer,
    catchup,
    fixture,
    router,
    params.channelId,
    params.playlistId,
    params.fixture,
    params.origin,
    contentType,
  ]);

  // The screen renders only once the session plays this channel — and, for
  // catch-up, this exact window — so the player is guaranteed to exist (and
  // belong to this stream) below.
  const isSessionReady = usePlaybackSessionStore(
    (s) =>
      !!channel &&
      !!params.playlistId &&
      !!streamUrl &&
      sessionMatches(s.session, {
        channelId: getChannelId(channel),
        playlistId: params.playlistId,
        catchup,
        streamUrl,
      })
  );

  /**
   * Leave the screen, falling back to the tabs when this route was opened cold
   * (a deep link, a notification) and there is no history to pop. `/(tabs)` on
   * its own lands on Home, which the user may have hidden.
   */
  const dismiss = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(firstVisibleTabHref(useUserStore.getState().currentUser?.settings));
  }, [router]);

  // Leaving the screen: healthy local playback minimizes into the mini bar
  // and keeps playing; casting hands off to the cast bar; a failed stream
  // just stops.
  const handleGoBack = useCallback(() => {
    const isCasting = useVideoPlayerStore.getState().isCasting;
    const sessionStore = usePlaybackSessionStore.getState();
    if (isCasting && channel && streamUrl && params.playlistId) {
      useCastMiniPlayerStore
        .getState()
        .activate(channel, params.playlistId, contentType, streamUrl, catchup);
      // The cast bar takes over — the idle local player isn't needed anymore.
      sessionStore.endSession();
    } else if (sessionStore.session && !sessionStore.session.error) {
      sessionStore.minimize();
    } else {
      stopVideoRef.current?.();
      sessionStore.endSession();
    }
    dismiss();
  }, [dismiss, channel, streamUrl, catchup, params.playlistId, contentType]);

  // Registered once with a stable callback: re-registering on every identity
  // change of `handleGoBack` pushed this handler to the front of the LIFO stack
  // again and again, so it started swallowing overlays' own back handling.
  const handleGoBackRef = useRef(handleGoBack);
  handleGoBackRef.current = handleGoBack;
  useLayoutEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      handleGoBackRef.current();
      return true;
    });

    return () => backHandler.remove();
  }, []);

  const handleRegisterStopFunction = useCallback((stopFn: () => void) => {
    stopVideoRef.current = stopFn;
  }, []);

  /** Switch a catch-up launch over to the channel's live stream. */
  const watchLive = useCallback(() => {
    router.replace({
      pathname: '/video-player',
      params: {
        channelId: params.channelId,
        playlistId: params.playlistId,
        contentType,
        ...(params.fixture ? { fixture: params.fixture } : {}),
        ...(params.origin ? { origin: params.origin } : {}),
      },
    });
  }, [router, params.channelId, params.playlistId, params.fixture, params.origin, contentType]);

  // Waiting for the channel, and then for what depends on it. Without a channel
  // there is nothing left to resolve — a rejected lookup must fall through to
  // the "Invalid Channel" layout rather than wait for a resume position that
  // will never be asked for.
  if (isLoadingChannel || (channel && (!isResumeResolved || isResolvingCatchup))) {
    return (
      <View style={styles.errorContainer}>
        <StatusBar hidden />
        {resumeDialogData && (
          <ConfirmDialog
            visible
            title="Resume Playback"
            message={`You were at ${formatPosition(resumeDialogData.position)}. Continue where you left off?`}
            actions={[
              {
                title: 'From Beginning',
                onPress: () => {
                  setResumeDialogData(null);
                  setIsResumeResolved(true);
                },
              },
              {
                title: 'Continue',
                variant: 'primary',
                onPress: () => {
                  setStartPosition(resumeDialogData.position);
                  setResumeDialogData(null);
                  setIsResumeResolved(true);
                },
              },
            ]}
          />
        )}
      </View>
    );
  }

  if (!channel) {
    return (
      <UnavailableLayout
        title="Invalid Channel"
        message="No channel data was provided"
        onBack={dismiss}
      />
    );
  }

  // Only reachable for catch-up: live playback always resolves to channel.url.
  if (!streamUrl) {
    return (
      <UnavailableLayout
        title="Catch-up unavailable"
        message="This channel has no archive for that time."
        onBack={dismiss}
        onWatchLive={watchLive}
      />
    );
  }

  // One-frame gap while the session effect above starts/replaces the session.
  if (!isSessionReady) {
    return (
      <View style={styles.container}>
        <StatusBar hidden />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <VideoPlayer
        channel={channel}
        streamUrl={streamUrl}
        startPosition={startPosition}
        onBack={handleGoBack}
        onRegisterStopFunction={handleRegisterStopFunction}
        onNext={handleNext}
        onPrevious={handlePrevious}
        hasNavigation={hasNavigation}
        fixture={fixture}
      />
    </View>
  );
}

interface UnavailableLayoutProps {
  title: string;
  message: string;
  onBack: () => void;
  /** Offered when the live stream is a usable alternative (catch-up launches). */
  onWatchLive?: () => void;
}

/**
 * Nothing can be played, and the player chrome that would normally offer a way
 * out never mounts — so this layout has to carry it itself.
 */
function UnavailableLayout({ title, message, onBack, onWatchLive }: UnavailableLayoutProps) {
  return (
    <View style={styles.errorContainer}>
      <StatusBar hidden />
      <IconSymbol name="exclamationmark.triangle" size={64} color={VIDEO_COLORS.text} />
      <ThemedText style={styles.errorTitle}>{title}</ThemedText>
      <ThemedText style={styles.errorSubtitle} type="subtitle">
        {message}
      </ThemedText>
      <View style={styles.errorActions}>
        <VideoStateButton label="Go Back" onPress={onBack} accessibilityLabel="Go back" />
        {onWatchLive && (
          <VideoStateButton
            label="Watch live"
            onPress={onWatchLive}
            accessibilityLabel="Watch the live stream instead"
          />
        )}
      </View>
    </View>
  );
}

const styles = {
  container: {
    flex: 1,
    backgroundColor: VIDEO_COLORS.background,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: 32,
    backgroundColor: VIDEO_COLORS.background,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600' as const,
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center' as const,
    color: VIDEO_COLORS.text,
  },
  errorSubtitle: {
    fontSize: 14,
    textAlign: 'center' as const,
    lineHeight: 20,
    color: VIDEO_COLORS.subtitle,
  },
  errorActions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    marginTop: 24,
  },
};
