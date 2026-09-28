import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';

import { usePlaybackSessionStore } from '@/stores/video/playback-session-store';
import { usePlaybackTimeStore } from '@/stores/video/playback-time-store';
import { useVideoPlayerStore } from '@/stores/video/player-store';
import { useVideoRetryStore } from '@/stores/video/retry-store';
import { useVideoUIStore } from '@/stores/video/ui-store';
import { useVideoControls } from './use-video-controls';
import { useVideoErrorHandling } from './use-video-error-handling';
import { checkNetwork, useVideoNetwork } from './use-video-network';
import { useVideoPlayerState } from './use-video-player-state';

interface UseVideoOrchestratorProps {
  startPosition?: number;
  onRegisterStopFunction?: (stopFn: () => void) => void;
}

/** How long after the first ready frame the controls pop up. */
const READY_CONTROLS_DELAY_MS = 500;
const READY_CONTROLS_VISIBLE_MS = 4000;

export function useVideoOrchestrator({
  startPosition = 0,
  onRegisterStopFunction,
}: UseVideoOrchestratorProps) {
  const isUnmountedRef = useRef(false);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readyControlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasAppliedStartPositionRef = useRef(false);
  // Whether this source has produced its first playable frame. `readyToPlay`
  // fires again after every rebuffer, and treating those as a fresh start
  // force-played a paused stream and popped the controls up mid-match.
  const hasBeenReadyRef = useRef(false);
  const startPositionRef = useRef(startPosition);
  startPositionRef.current = startPosition;

  // Specialized hooks. Viewing-history tracking is NOT here — it lives in
  // PlaybackSessionHost so progress keeps recording while the session plays
  // in the mini bar after this screen unmounts.
  const playerState = useVideoPlayerState();
  const player = playerState.player;
  const errorHandling = useVideoErrorHandling(player);
  const controls = useVideoControls();
  const network = useVideoNetwork();
  const { setters } = playerState;

  // What the session is playing. Keyed on this (not `channel.url`) so a
  // catch-up window and the live stream of the same channel are different
  // streams to the screen, just as they are to the session.
  const streamUrl = usePlaybackSessionStore((s) => s.session?.streamUrl ?? null);

  // One definition of "live", shared by the gesture bottom zone, the resync
  // button and the seek bar. `player.isLive` alone is false for the raw MPEG-TS
  // most panels serve, which let a swipe seek a live stream to 0 and hid the
  // resync button; the session knows better. A catch-up window is a finite
  // recording, so it is never live even on a live channel.
  const sessionIsLive = usePlaybackSessionStore(
    (s) => s.session?.contentType === 'live' && s.session.catchup == null
  );
  const [playerIsLive, setPlayerIsLive] = useState(false);
  const isLive = sessionIsLive || playerIsLive;

  // Published once by the session host. A live stream has no timeline to show,
  // so selecting a constant for it keeps the 1 Hz tick from re-rendering the
  // player tree.
  const currentTime = usePlaybackTimeStore((s) => (isLive ? 0 : s.currentTime));
  const duration = usePlaybackTimeStore((s) => (isLive ? 0 : s.duration));
  const isPlaying = usePlaybackTimeStore((s) => s.isPlaying);

  const seekTo = useCallback((time: number) => {
    if (player) {
      player.currentTime = time;
    }
  }, [player]);

  // Everything the long-lived native listeners and the focus effect need, kept
  // current without becoming an effect dependency. Their memoised identities
  // change on every error, retry and controls toggle; re-subscribing native
  // listeners (or re-running the focus effect, whose cleanup pauses playback)
  // that often is what made playback stutter and errors flicker away.
  const collaborators = {
    errorActions: errorHandling.actions,
    controlActions: controls.actions,
    playerControls: playerState.controls,
  };
  const latest = useRef(collaborators);
  latest.current = collaborators;

  // Only a new stream resets the screen. Depending on the error/UI actions
  // instead would make setting an error immediately clear it again, leaving
  // the loading overlay up forever. The session's error is deliberately NOT
  // cleared here: expanding onto a stream that failed while minimized has to
  // keep showing it.
  useEffect(() => {
    hasAppliedStartPositionRef.current = false;
    hasBeenReadyRef.current = false;
    setPlayerIsLive(false);
    setters.reset();
    useVideoRetryStore.getState().reset();
    useVideoUIStore.getState().reset();
  }, [streamUrl, player, setters]);

  /**
   * Reconnect the stream from scratch: the retry after an error, the resync of
   * a live stream that has drifted or stalled, and the recovery of a player
   * that was left unloaded are all this one operation. Reloading is what a live
   * IPTV stream needs — it usually reports no seekable range, and a fresh load
   * always lands at the live edge.
   */
  const reloadSource = useCallback(async () => {
    hasBeenReadyRef.current = false;
    setters.setIsLoading(true);
    setters.setLoadingStage('connecting');
    await usePlaybackSessionStore.getState().reloadSource();
  }, [setters]);

  const stopVideo = useCallback(() => {
    playerState.controls.stopVideo();
    controls.actions.clearHideControlsTimeout();
  }, [playerState.controls, controls.actions]);

  const togglePlayPause = useCallback(() => {
    playerState.controls.togglePlayPause();
    controls.actions.scheduleHideControls();
  }, [playerState.controls, controls.actions]);

  // Network-aware retry: back off, then reload the source. Replaying (a seek to
  // 0 on a player that never prepared) left the screen "Connecting…" forever.
  const retryPlayback = useCallback(async () => {
    if (!errorHandling.canRetry) return;
    errorHandling.actions.startRetry();

    const networkState = await checkNetwork();
    if (!networkState.isConnected) {
      // Still counts as an attempt — leaving `isRetrying` set would disable the
      // Try Again button for good.
      errorHandling.actions.completeRetry();
      // Worded so getVideoErrorInfo classifies it as the connection problem it
      // is, instead of falling through to the generic "Playback Error".
      errorHandling.actions.handleError(new Error('No network connection'));
      return;
    }

    const delay = errorHandling.actions.getRetryDelay();
    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    retryTimeoutRef.current = setTimeout(() => {
      retryTimeoutRef.current = null;
      if (isUnmountedRef.current) return;
      latest.current.controlActions.hideControls();
      latest.current.errorActions.completeRetry();
      void reloadSource();
    }, delay);
  }, [errorHandling.canRetry, errorHandling.actions, reloadSource]);

  // Player status. Subscribes once per player: the callbacks reach everything
  // else through `latest`, so a controls toggle or an error never tears the
  // native listeners down mid-stream. Errors are NOT handled here — the session
  // host records those on the session, which is the only place that still
  // exists when the stream fails while minimized.
  useEffect(() => {
    if (!player) return;

    const statusSubscription = player.addListener('statusChange', ({ status }) => {
      const { errorActions, playerControls, controlActions } = latest.current;

      if (status === 'loading') {
        setters.setLoadingStage('buffering');
        return;
      }
      if (status !== 'readyToPlay') return;

      setters.setIsLoading(false);
      setPlayerIsLive(player.isLive);

      // Everything below belongs to the first ready frame of this source only.
      if (hasBeenReadyRef.current) return;
      hasBeenReadyRef.current = true;
      errorActions.onRetrySuccess();

      if (startPositionRef.current > 0 && !hasAppliedStartPositionRef.current) {
        hasAppliedStartPositionRef.current = true;
        player.currentTime = startPositionRef.current;
      }

      if (!useVideoPlayerStore.getState().isCasting) {
        playerControls.playVideo();
      }

      readyControlsTimeoutRef.current = setTimeout(() => {
        readyControlsTimeoutRef.current = null;
        if (!isUnmountedRef.current) {
          controlActions.showControlsTemporarily(READY_CONTROLS_VISIBLE_MS);
        }
      }, READY_CONTROLS_DELAY_MS);
    });

    return () => statusSubscription.remove();
  }, [player, setters]);

  // Adopt a player that is already settled (expanding from the mini bar, or a
  // stream that finished loading before this screen mounted): `statusChange`
  // will not re-fire for it, so mirror its current status once.
  useEffect(() => {
    if (!player) return;

    if (player.status === 'readyToPlay') {
      hasBeenReadyRef.current = true;
      setters.setIsLoading(false);
      setPlayerIsLive(player.isLive);
      return;
    }
    if (player.status === 'error') {
      // The session already carries the error (recorded by the host); all this
      // screen has to do is stop pretending it is still connecting.
      setters.setIsLoading(false);
      return;
    }
    // Idle with a source already attached means the player was unloaded — by a
    // cast takeover, for instance. A brand-new session is idle too, but its
    // source is still on its way, and reloading would fight for the panel's
    // only connection.
    if (player.status === 'idle' && usePlaybackSessionStore.getState().session?.sourceAttached) {
      void reloadSource();
    }
  }, [player, setters, reloadSource]);

  // The host records errors even while minimized, so the screen can find one
  // already set when it mounts, or arrive while it is showing the overlay.
  useEffect(() => {
    if (errorHandling.error) setters.setIsLoading(false);
  }, [errorHandling.error, setters]);

  // A stream that died with the connection down recovers by itself the moment
  // the connection is back, instead of waiting for a Try Again press.
  const wasConnectedRef = useRef(network.isConnected);
  useEffect(() => {
    const restored = network.isConnected && !wasConnectedRef.current;
    wasConnectedRef.current = network.isConnected;
    if (!restored) return;
    if (!usePlaybackSessionStore.getState().session?.error) return;
    void reloadSource();
  }, [network.isConnected, reloadSource]);

  // Register stop function
  useEffect(() => {
    onRegisterStopFunction?.(stopVideo);
  }, [onRegisterStopFunction, stopVideo]);

  // Focus effect handling. The cleanup pauses playback, so it must only be
  // torn down when the player itself changes — never on an unrelated re-render
  // of the screen.
  useFocusEffect(
    useCallback(() => {
      return () => {
        // Backing out into the mini bar must keep playing — only pause when
        // the screen loses focus with the session still in fullscreen mode.
        if (usePlaybackSessionStore.getState().session?.mode === 'mini') return;
        try {
          if (!isUnmountedRef.current && player) {
            latest.current.playerControls.pauseVideo();
          }
        } catch (error) {
          console.warn('Error pausing video on focus loss:', error);
        }
      };
    }, [player])
  );

  // Cleanup
  const { clearHideControlsTimeout } = controls.actions;
  useEffect(() => {
    return () => {
      clearHideControlsTimeout();
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      if (readyControlsTimeoutRef.current) {
        clearTimeout(readyControlsTimeoutRef.current);
        readyControlsTimeoutRef.current = null;
      }
      useVideoRetryStore.getState().reset();
      useVideoUIStore.getState().reset();
      // Only clears `isCasting` — the session owns the player and outlives
      // this screen (minimized into the mini bar). The cast branch of the
      // screen's `handleGoBack` ends the session before navigating away, so
      // dropping the casting flag here is always correct.
      useVideoPlayerStore.getState().reset();
    };
  }, [clearHideControlsTimeout]);

  // Track unmount state
  useEffect(() => {
    return () => {
      isUnmountedRef.current = true;
    };
  }, []);

  return {
    // Player state
    player,
    isLoading: playerState.isLoading,
    loadingStage: playerState.loadingStage,
    isPlaying,

    // Seek bar state
    currentTime,
    duration,
    isLive,

    // Error state
    hasError: errorHandling.hasError,
    videoError: errorHandling.error,
    retryState: errorHandling.retryState,

    // UI state
    showControls: controls.showControls,

    // Actions
    togglePlayPause,
    stopVideo,
    playVideo: playerState.controls.playVideo,
    pauseVideo: playerState.controls.pauseVideo,
    seekTo,
    retryPlayback,
    resyncToLive: reloadSource,
    showControlsTemporarily: controls.actions.showControlsTemporarily,
    clearHideControlsTimeout: controls.actions.clearHideControlsTimeout,
    toggleControls: controls.actions.toggleControls,
  };
}
