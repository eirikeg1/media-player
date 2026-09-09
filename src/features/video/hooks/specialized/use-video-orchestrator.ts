import { useVideoErrorStore } from '@/stores/video/error-store';
import { buildVideoSource, usePlaybackSessionStore } from '@/stores/video/playback-session-store';
import { useVideoPlayerStore } from '@/stores/video/player-store';
import { useVideoUIStore } from '@/stores/video/ui-store';
import type { Channel } from '@/types/playlist.types';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getVideoErrorInfo } from '../../types/video-error.types';
import { useVideoControls } from './use-video-controls';
import { useVideoErrorHandling } from './use-video-error-handling';
import { useVideoNetwork } from './use-video-network';
import { useVideoPlayerState } from './use-video-player-state';

interface UseVideoOrchestratorProps {
  channel: Channel;
  startPosition?: number;
  onStopVideo?: () => void;
  onRegisterStopFunction?: (stopFn: () => void) => void;
}

export function useVideoOrchestrator({
  channel,
  startPosition,
  onStopVideo,
  onRegisterStopFunction,
}: UseVideoOrchestratorProps) {
  const isUnmountedRef = useRef(false);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasAppliedStartPositionRef = useRef(false);

  // Specialized hooks. Viewing-history tracking is NOT here — it lives in
  // PlaybackSessionHost so progress keeps recording while the session plays
  // in the mini bar after this screen unmounts.
  const playerState = useVideoPlayerState();
  const errorHandling = useVideoErrorHandling();
  const controls = useVideoControls();
  const network = useVideoNetwork();

  // Seek bar state
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLive, setIsLive] = useState(false);

  const seekTo = useCallback((time: number) => {
    if (playerState.player) {
      playerState.player.currentTime = time;
    }
  }, [playerState.player]);

  // Everything the long-lived native listeners and the focus effect need, kept
  // current without becoming an effect dependency. Their memoised identities
  // change on every error, retry and controls toggle; re-subscribing native
  // listeners (or re-running the focus effect, whose cleanup pauses playback)
  // that often is what made playback stutter and errors flicker away.
  const collaborators = {
    errorActions: errorHandling.actions,
    controlActions: controls.actions,
    playerControls: playerState.controls,
    setters: playerState.setters,
    onStopVideo,
  };
  const latest = useRef(collaborators);
  latest.current = collaborators;

  // Only a new stream resets the screen. Depending on the error/UI actions
  // instead would make setting an error immediately clear it again, leaving
  // the loading overlay up forever.
  useEffect(() => {
    hasAppliedStartPositionRef.current = false;
    setCurrentTime(0);
    setDuration(0);
    setIsLive(false);
    latest.current.setters.reset();
    useVideoErrorStore.getState().clearError();
    useVideoErrorStore.getState().resetRetryState();
    useVideoUIStore.getState().reset();
  }, [channel.url]);

  // Enhanced stop function that coordinates all state
  const stopVideo = useCallback(() => {
    playerState.controls.stopVideo();
    controls.actions.clearHideControlsTimeout();
    onStopVideo?.();
  }, [playerState.controls, controls.actions, onStopVideo]);

  // Enhanced toggle with controls coordination
  const togglePlayPause = useCallback(() => {
    playerState.controls.togglePlayPause();
    controls.actions.scheduleHideControls();
  }, [playerState.controls, controls.actions]);

  // Network-aware retry logic
  const retryPlayback = useCallback(async () => {
    if (!errorHandling.canRetry) return;

    if (!errorHandling.actions.startRetry()) return;

    // Check network before retrying
    const networkState = await network.actions.checkNetwork();
    if (!networkState.isConnected) {
      const networkError = getVideoErrorInfo(new Error('No internet connection'), 0);
      errorHandling.actions.handleError(networkError);
      return;
    }

    // Calculate delay and retry
    const delay = errorHandling.actions.getRetryDelay();

    retryTimeoutRef.current = setTimeout(() => {
      if (!isUnmountedRef.current) {
        // Reset states for retry
        errorHandling.actions.clearError();
        playerState.setters.setIsLoading(true);
        playerState.setters.setLoadingStage('connecting');
        controls.actions.hideControls();
        playerState.setters.setIsPlaying(false);

        // Complete retry state update
        errorHandling.actions.completeRetry();

        // Trigger replay
        playerState.controls.replayVideo();
      }
    }, delay);
  }, [
    errorHandling.canRetry,
    errorHandling.actions,
    network.actions,
    playerState.setters,
    playerState.controls,
    controls.actions,
  ]);

  // Snap a live stream back to the live edge. Reloads the source rather than
  // seeking: live IPTV streams usually report no seekable duration, and a
  // fresh load always reconnects at the live edge (and recovers a stalled or
  // drifted stream). The statusChange listener drives the loading overlay off
  // and auto-plays once the reloaded stream is ready.
  const resyncToLive = useCallback(async () => {
    const player = playerState.player;
    if (!player) return;
    playerState.setters.setIsLoading(true);
    playerState.setters.setLoadingStage('connecting');
    try {
      // Reload what the session is actually playing: a catch-up window has its
      // own archive URL, and reloading `channel.url` would drop the viewer out
      // of the archive and onto the live stream.
      const session = usePlaybackSessionStore.getState().session;
      await player.replaceAsync(buildVideoSource(session?.channel ?? channel, session?.streamUrl));
    } catch (error) {
      console.warn('Error resyncing to live:', error);
      playerState.setters.setIsLoading(false);
      errorHandling.actions.handleError(
        getVideoErrorInfo(error instanceof Error ? error : new Error(String(error)), 0)
      );
    }
  }, [playerState.player, playerState.setters, errorHandling.actions, channel]);

  // Player status change handler. Subscribes once per player: the callbacks
  // reach everything else through `latest`, so a controls toggle or an error
  // never tears the native listeners down mid-stream.
  const player = playerState.player;
  useEffect(() => {
    if (!player) return;

    const statusSubscription = player.addListener('statusChange', ({ status, error }) => {
      const { setters, errorActions, playerControls, controlActions } = latest.current;

      if (status === 'loading') {
        setters.setLoadingStage('buffering');
        setters.setLoadingProgress(undefined);
      } else if (status === 'readyToPlay') {
        setters.setIsLoading(false);
        errorActions.onRetrySuccess();

        // Detect live stream vs finite content
        setIsLive(player.isLive);
        const d = player.duration;
        if (isFinite(d) && d > 0) {
          setDuration(d);
        }

        if (startPosition && startPosition > 0 && !hasAppliedStartPositionRef.current) {
          hasAppliedStartPositionRef.current = true;
          player.currentTime = startPosition;
        }

        if (!useVideoPlayerStore.getState().isCasting) {
          playerControls.playVideo();
        }

        // Use a shorter timeout initially, then switch to temporary showing
        setTimeout(() => {
          if (!isUnmountedRef.current) {
            controlActions.showControlsTemporarily(4000);
          }
        }, 500);
      } else if (status === 'error' || error) {
        setters.setIsLoading(false);
        errorActions.handleError(error);
      }
    });

    const playingSubscription = player.addListener('playingChange', ({ isPlaying }) => {
      latest.current.setters.setIsPlaying(isPlaying);
    });

    const timeUpdateSubscription = player.addListener('timeUpdate', ({ currentTime: time }) => {
      setCurrentTime(time);
      // Update duration if it becomes available after initial readyToPlay
      const d = player.duration;
      if (isFinite(d) && d > 0) {
        setDuration(d);
      }
    });

    return () => {
      statusSubscription?.remove();
      playingSubscription?.remove();
      timeUpdateSubscription?.remove();
    };
  }, [player, startPosition]);

  // Adopt an already-running player (expanding from the mini bar): its
  // statusChange event won't re-fire for a player that is already ready, so
  // read the current state synchronously instead of waiting on the listener.
  // A freshly started session's player is still sourceless here, so this is a
  // no-op for it and the listener above drives the load.
  useEffect(() => {
    if (!player || player.status !== 'readyToPlay') return;
    playerState.setters.setIsLoading(false);
    playerState.setters.setIsPlaying(player.playing);
    setIsLive(player.isLive);
    setCurrentTime(player.currentTime);
    const d = player.duration;
    if (isFinite(d) && d > 0) {
      setDuration(d);
    }
  }, [player, playerState.setters]);

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
        latest.current.onStopVideo?.();
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
      useVideoErrorStore.getState().reset();
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
    player: playerState.player,
    isLoading: playerState.isLoading,
    loadingStage: playerState.loadingStage,
    loadingProgress: playerState.loadingProgress,
    isPlaying: playerState.isPlaying,

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

    // Network state
    networkState: network.networkState,

    // Actions
    togglePlayPause,
    stopVideo,
    playVideo: playerState.controls.playVideo,
    pauseVideo: playerState.controls.pauseVideo,
    seekTo,
    retryPlayback,
    resyncToLive,
    showControlsTemporarily: controls.actions.showControlsTemporarily,
    clearHideControlsTimeout: controls.actions.clearHideControlsTimeout,
    toggleControls: controls.actions.toggleControls,
  };
}
