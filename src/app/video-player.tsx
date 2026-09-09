import type { Fixture } from 'expo-m3u-parser';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, StatusBar } from 'react-native';

import { ConfirmDialog } from '@/components/ui/containers/modal/confirm-dialog';
import { shouldHandOverToLive } from '@/features/sports/catchup';
import { VideoPlayer } from '@/features/video/components/video-player';
import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getChannelId } from '@/lib/channel-utils';
import { RustChannelService } from '@/services/rust-channel-service';
import { useCastMiniPlayerStore } from '@/stores/video/cast-mini-player-store';
import { useUserStore } from '@/stores/user/user-store';
import { useVideoErrorStore } from '@/stores/video/error-store';
import { useGestureStore } from '@/stores/video/gesture-store';
import { useVideoNetworkStore } from '@/stores/video/network-store';
import {
  sessionMatches,
  usePlaybackSessionStore,
} from '@/stores/video/playback-session-store';
import { useVideoPlayerStore } from '@/stores/video/player-store';
import { usePlaybackQueueStore } from '@/stores/video/queue-store';
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
  }>();
  const contentType = (params.contentType as ContentType) || 'live';

  // Sports catch-up launches carry the archive window to play instead of the
  // channel's live stream. A malformed pair simply means live playback.
  const catchup = useMemo(
    () => parseCatchupParams(params.catchupStart, params.catchupDuration),
    [params.catchupStart, params.catchupDuration]
  );

  // Sports launches pass the associated fixture (serialized) so the player can
  // surface SofaScore match widgets. Parse defensively — a bad value just means
  // no widgets, never a crashed screen.
  const fixture = useMemo<Fixture | null>(() => {
    if (!params.fixture) return null;
    try {
      return JSON.parse(params.fixture) as Fixture;
    } catch {
      return null;
    }
  }, [params.fixture]);
  const iconColor = useThemeColor({}, 'icon');
  const stopVideoRef = useRef<(() => void) | null>(null);

  // Whether the mini bar's session already plays this exact channel
  // (expanding). Adopted launches reuse the session's channel and skip the
  // resume prompt so playback continues seamlessly; consumed on first use so
  // later in-screen channel switches behave normally.
  const adoptedRef = useRef(
    !!params.channelId &&
      !!params.playlistId &&
      sessionMatches(
        usePlaybackSessionStore.getState().session,
        params.channelId,
        params.playlistId,
        catchup
      )
  );

  // Look up channel from route params
  const [channel, setChannel] = useState<Channel | null>(null);
  const [isLoadingChannel, setIsLoadingChannel] = useState(true);

  // What is actually played: the channel's URL, or the panel's archive URL for
  // a catch-up window. Null once resolved means the panel has no such archive.
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [isResolvingStream, setIsResolvingStream] = useState(true);

  // Resume playback state
  const [startPosition, setStartPosition] = useState(0);
  const [isResumeResolved, setIsResumeResolved] = useState(false);
  const [resumeDialogData, setResumeDialogData] = useState<{ position: number } | null>(null);

  // Dismiss the cast mini bar when this screen mounts (expanding from bar or new channel)
  useEffect(() => {
    useCastMiniPlayerStore.getState().dismiss();
  }, []);

  // Reset stores not covered by the orchestrator's unmount cleanup. The
  // playback queue is NOT reset here — it belongs to the session (so
  // next/previous survive minimize → expand) and resets in endSession.
  useEffect(() => {
    useVideoNetworkStore.getState().reset();
    useGestureStore.getState().reset();
  }, []);

  // Playback queue navigation
  const queueHasNavigation = usePlaybackQueueStore(s => s.channels.length > 1);
  const hasNavigation = queueHasNavigation && contentType !== 'movie';

  const handleChannelSwitch = useCallback((newChannel: Channel | null) => {
    if (!newChannel) return;
    stopVideoRef.current?.();
    setStartPosition(0);
    setIsResumeResolved(false);
    setResumeDialogData(null);
    setStreamUrl(null);
    setIsResolvingStream(true);
    setChannel(newChannel);
    setIsLoadingChannel(false);
  }, []);

  const handleNext = useCallback(() => {
    handleChannelSwitch(usePlaybackQueueStore.getState().goNext());
  }, [handleChannelSwitch]);

  const handlePrevious = useCallback(() => {
    handleChannelSwitch(usePlaybackQueueStore.getState().goPrevious());
  }, [handleChannelSwitch]);

  useEffect(() => {
    if (!params.channelId || !params.playlistId) {
      setIsLoadingChannel(false);
      return;
    }

    // Expanding from the mini bar: the session already holds the channel.
    const session = usePlaybackSessionStore.getState().session;
    if (adoptedRef.current && session) {
      setChannel(session.channel);
      setIsLoadingChannel(false);
      return;
    }

    RustChannelService.getChannelById(params.playlistId, params.channelId)
      .then(setChannel)
      .catch((error) => {
        console.error('Failed to load channel:', error);
      })
      .finally(() => setIsLoadingChannel(false));
  }, [params.channelId, params.playlistId]);

  // Resolve what to play. Live playback is the channel's own URL; a catch-up
  // window has to be turned into a panel archive URL, which only Xtream
  // playlists can serve (null otherwise — see the error layout below).
  useEffect(() => {
    if (!channel || isLoadingChannel) return;

    if (!catchup) {
      setStreamUrl(channel.url);
      setIsResolvingStream(false);
      return;
    }

    // Expanding from the mini bar: the session already holds the archive URL.
    const session = usePlaybackSessionStore.getState().session;
    if (adoptedRef.current && session) {
      setStreamUrl(session.streamUrl);
      setIsResolvingStream(false);
      return;
    }

    let cancelled = false;
    setIsResolvingStream(true);
    RustChannelService.getCatchupStreamUrl(
      params.playlistId,
      getChannelId(channel),
      catchup.start,
      catchup.durationMinutes
    )
      .then((url) => {
        if (!cancelled) setStreamUrl(url);
      })
      .catch((error) => {
        console.error('Failed to resolve catch-up stream:', error);
      })
      .finally(() => {
        if (!cancelled) setIsResolvingStream(false);
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

    const channelId = getChannelId(channel);
    useUserStore.getState().getSavedPosition(userId, params.playlistId, channelId)
      .then((saved) => {
        if (!saved) {
          setIsResumeResolved(true);
          return;
        }

        setResumeDialogData({ position: saved.lastPosition });
      })
      .catch(() => {
        setIsResumeResolved(true);
      });
  }, [channel, isLoadingChannel, contentType, params.playlistId]);

  // Start (or adopt) the app-wide playback session once the channel and
  // resume position are known. Also runs on in-screen channel switches
  // (queue next/previous), replacing the session for the new channel.
  useEffect(() => {
    if (!channel || !isResumeResolved || !streamUrl || !params.playlistId) return;
    const store = usePlaybackSessionStore.getState();
    if (sessionMatches(store.session, getChannelId(channel), params.playlistId, catchup)) {
      store.expand();
      return;
    }
    store.startSession({
      channel,
      playlistId: params.playlistId,
      contentType,
      fixture,
      startPosition,
      streamUrl,
      catchup,
    });
  }, [channel, isResumeResolved, streamUrl, catchup, params.playlistId, contentType, fixture, startPosition]);

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
    contentType,
  ]);

  // The screen renders only once the session plays this channel — and, for
  // catch-up, this exact window — so the player is guaranteed to exist (and
  // belong to this stream) below.
  const isSessionReady = usePlaybackSessionStore(
    (s) =>
      !!channel &&
      !!params.playlistId &&
      sessionMatches(s.session, getChannelId(channel), params.playlistId, catchup)
  );

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
    } else if (sessionStore.session && !useVideoErrorStore.getState().hasError) {
      sessionStore.minimize();
    } else {
      stopVideoRef.current?.();
      sessionStore.endSession();
    }
    router.back();
  }, [router, channel, streamUrl, catchup, params.playlistId, contentType]);

  useLayoutEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      handleGoBack();
      return true;
    });

    return () => backHandler.remove();
  }, [handleGoBack]);

  // Stable identities: the orchestrator's focus effect and stop-function
  // registration hang off these, and a new identity on every render would
  // re-run them (the focus cleanup pauses playback).
  const handleStopVideo = useCallback(() => {
    // This will be called when video stops
  }, []);

  const handleRegisterStopFunction = useCallback((stopFn: () => void) => {
    stopVideoRef.current = stopFn;
  }, []);

  if (isLoadingChannel || !isResumeResolved || isResolvingStream) {
    return (
      <ThemedView style={styles.errorContainer}>
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
      </ThemedView>
    );
  }

  if (!channel) {
    return (
      <ThemedView style={styles.errorContainer}>
        <StatusBar hidden />
        <IconSymbol name="exclamationmark.triangle" size={64} color={iconColor} />
        <ThemedText style={styles.errorTitle}>Invalid Channel</ThemedText>
        <ThemedText style={styles.errorSubtitle} type="subtitle">
          No channel data was provided
        </ThemedText>
      </ThemedView>
    );
  }

  // Only reachable for catch-up: live playback always resolves to channel.url.
  if (!streamUrl) {
    return (
      <ThemedView style={styles.errorContainer}>
        <StatusBar hidden />
        <IconSymbol name="exclamationmark.triangle" size={64} color={iconColor} />
        <ThemedText style={styles.errorTitle}>Catch-up unavailable</ThemedText>
        <ThemedText style={styles.errorSubtitle} type="subtitle">
          This channel has no archive for that time.
        </ThemedText>
      </ThemedView>
    );
  }

  // One-frame gap while the session effect above starts/replaces the session.
  if (!isSessionReady) {
    return (
      <ThemedView style={styles.container}>
        <StatusBar hidden />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <StatusBar hidden />
      <VideoPlayer
        channel={channel}
        streamUrl={streamUrl}
        startPosition={startPosition}
        onBack={handleGoBack}
        onStopVideo={handleStopVideo}
        onRegisterStopFunction={handleRegisterStopFunction}
        onNext={handleNext}
        onPrevious={handlePrevious}
        hasNavigation={hasNavigation}
        fixture={fixture}
      />
    </ThemedView>
  );
}

const styles = {
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: 32,
    backgroundColor: '#000',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600' as const,
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center' as const,
  },
  errorSubtitle: {
    fontSize: 14,
    textAlign: 'center' as const,
    lineHeight: 20,
  },
};