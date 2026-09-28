import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { CastState, useCastState } from 'react-native-google-cast';

import { getChannelId } from '@/lib/channel-utils';
import { useUserStore } from '@/stores/user/user-store';
import {
  usePlaybackSessionStore,
  type PlaybackSession,
} from '@/stores/video/playback-session-store';
import { usePlaybackTimeStore } from '@/stores/video/playback-time-store';
import { useVideoRetryStore } from '@/stores/video/retry-store';
import { getVideoErrorInfo } from '../types/video-error.types';
import { useViewingHistory } from '../hooks/specialized/use-viewing-history';

/**
 * Always-mounted (in the root layout) companion of the playback session.
 * It hosts everything that must outlive the video screen: the player's
 * timeline and error state, viewing history and resume positions all keep
 * working while the session plays in the mini bar. Screen-only concerns
 * (controls, gestures, error UI) stay in the video screen's orchestrator.
 */
export function PlaybackSessionHost() {
  const session = usePlaybackSessionStore((s) => s.session);

  useSessionPlayback(session);
  useForegroundResume(session);
  useCastTakeover(session);

  if (!session) return null;
  // Keyed per channel — and per catch-up window, so switching the same channel
  // between live and an archive window also starts a fresh history session.
  return (
    <SessionHistoryTracker
      key={`${session.playlistId}:${getChannelId(session.channel)}:${session.catchup?.start ?? 'live'}`}
      session={session}
    />
  );
}

/**
 * The single subscription to the session player: it publishes the timeline
 * every consumer selects from, and records playback failures on the session.
 *
 * Both have to live here rather than in the video screen. Two `timeUpdate`
 * subscribers (screen and host) doubled the bridge traffic for the same events,
 * and an error raised while the screen was closed went unnoticed entirely —
 * the mini bar kept saying "Tap to expand" over a dead stream.
 */
function useSessionPlayback(session: PlaybackSession | null): void {
  const player = session?.player ?? null;

  useEffect(() => {
    const time = usePlaybackTimeStore.getState();
    time.reset();
    if (!player) return;

    time.setIsPlaying(player.playing);

    const playingSubscription = player.addListener('playingChange', ({ isPlaying }) => {
      time.setIsPlaying(isPlaying);
    });
    const timeSubscription = player.addListener('timeUpdate', ({ currentTime }) => {
      time.publishTime(currentTime, player.duration);
    });
    const statusSubscription = player.addListener('statusChange', ({ status, error }) => {
      const sessionStore = usePlaybackSessionStore.getState();
      if (status === 'error' || error) {
        const info = getVideoErrorInfo(error, useVideoRetryStore.getState().retryState.attempt);
        console.error('[PlaybackSession] Playback failed:', error, 'Enhanced:', info);
        sessionStore.setSessionError(player, info);
      } else if (status === 'readyToPlay') {
        sessionStore.setSessionError(player, null);
      }
    });

    return () => {
      playingSubscription.remove();
      timeSubscription.remove();
      statusSubscription.remove();
    };
  }, [player]);
}

/**
 * Resume playback when the app comes back to the foreground.
 *
 * Without background playback the OS suspends the stream, and expo-video does
 * not restart it by itself. A live stream additionally has to be reloaded: the
 * buffer it was suspended with is minutes behind by now, and reconnecting is
 * the only way back to the live edge.
 */
function useForegroundResume(session: PlaybackSession | null): void {
  const player = session?.player ?? null;
  const sessionRef = useRef(session);
  sessionRef.current = session;

  useEffect(() => {
    if (!player) return;

    // Whether playback was running the last time the app was in the foreground.
    // Sampling `player.playing` when the app leaves is too late — the OS has
    // usually suspended the stream by then, so it always read false and nothing
    // ever resumed. Tracking `playingChange` while foregrounded gets it right;
    // the pause the suspension causes arrives after the app is already gone.
    let isForeground = AppState.currentState === 'active';
    let wasPlayingInForeground = isForeground && player.playing;

    const playingSubscription = player.addListener('playingChange', ({ isPlaying }) => {
      if (isForeground) wasPlayingInForeground = isPlaying;
    });

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        isForeground = false;
        return;
      }
      isForeground = true;
      if (!wasPlayingInForeground) return;

      const current = sessionRef.current;
      if (!current || current.player !== player) return;

      // Both branches end up playing: `reloadSource` starts the reconnected
      // stream itself, since a live buffer minutes behind is unusable.
      if (current.contentType === 'live' && current.catchup == null) {
        void usePlaybackSessionStore.getState().reloadSource();
        return;
      }
      try {
        player.play();
      } catch (error) {
        console.warn('[PlaybackSession] Failed to resume playback:', error);
      }
    });

    return () => {
      playingSubscription.remove();
      appStateSubscription.remove();
    };
  }, [player]);
}

/**
 * Give up the local stream when a cast session takes over while the session is
 * minimized. The video screen does this for itself (`useCastPlayback`), but a
 * mini bar has no screen — and the panel allows a single connection, so the two
 * would fight over it and play the same match twice.
 *
 * Ending the session (rather than only unloading the player) also removes the
 * bar, which would otherwise sit there offering play/pause on a dead player.
 */
function useCastTakeover(session: PlaybackSession | null): void {
  const castState = useCastState();
  const isMinimized = session?.mode === 'mini';

  useEffect(() => {
    if (!isMinimized) return;
    // Only a finished handover ends the session: CONNECTING is also what a
    // failed or cancelled attempt goes through, and killing playback for one
    // left the user with nothing playing anywhere.
    if (castState !== CastState.CONNECTED) return;
    usePlaybackSessionStore.getState().endSession();
  }, [castState, isMinimized]);
}

function SessionHistoryTracker({ session }: { session: PlaybackSession }) {
  const userId = useUserStore((s) => s.currentUser?.id);
  const currentTime = usePlaybackTimeStore((s) => s.currentTime);
  const duration = usePlaybackTimeStore((s) => s.duration);
  const isPlaying = usePlaybackTimeStore((s) => s.isPlaying);

  useViewingHistory({
    userId,
    playlistId: session.playlistId,
    channel: session.channel,
    contentType: session.contentType,
    startPosition: session.startPosition,
    currentTime,
    duration,
    isPlaying,
  });

  return null;
}
