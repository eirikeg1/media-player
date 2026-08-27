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

  useEffect(() => {
    hasAppliedStartPositionRef.current = false;
    setCurrentTime(0);
    setDuration(0);
    setIsLive(false);
    playerState.setters.reset();
    errorHandling.actions.clearError();
    useVideoErrorStore.getState().resetRetryState();
    useVideoUIStore.getState().reset();
  }, [channel.url, playerState.setters, errorHandling.actions]);

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
      await player.replaceAsync(buildVideoSource(channel));
    } catch (error) {
      console.warn('Error resyncing to live:', error);
      playerState.setters.setIsLoading(false);
      errorHandling.actions.handleError(
        getVideoErrorInfo(error instanceof Error ? error : new Error(String(error)), 0)
      );
    }
  }, [playerState.player, playerState.setters, errorHandling.actions, channel]);

  // Player status change handler
  useEffect(() => {
    if (!playerState.player) {
      console.log('No player available for status listener');
      return;
    }

    console.log('Setting up video player status listener');
    const statusSubscription = playerState.player.addListener('statusChange', ({ status, error }) => {
      console.log('Video status change:', status, error);

      if (status === 'loading') {
        console.log('Video loading - setting buffering stage');
        playerState.setters.setLoadingStage('buffering');
        playerState.setters.setLoadingProgress(undefined);
      } else if (status === 'readyToPlay') {
        console.log('Video ready to play - auto starting');
        playerState.setters.setIsLoading(false);
        errorHandling.actions.onRetrySuccess();

        // Detect live stream vs finite content
        if (playerState.player) {
          setIsLive(playerState.player.isLive);
          const d = playerState.player.duration;
          if (isFinite(d) && d > 0) {
            setDuration(d);
          }
        }

        if (startPosition && startPosition > 0 && playerState.player && !hasAppliedStartPositionRef.current) {
          hasAppliedStartPositionRef.current = true;
          playerState.player.currentTime = startPosition;
        }

        const { isCasting } = useVideoPlayerStore.getState();
        if (!isCasting) {
          playerState.controls.playVideo();
        }

        // Use a shorter timeout initially, then switch to temporary showing
        setTimeout(() => {
          if (!isUnmountedRef.current) {
            controls.actions.showControlsTemporarily(4000);
          }
        }, 500);
      } else if (status === 'error' || error) {
        console.log('Video error:', error);
        playerState.setters.setIsLoading(false);
        errorHandling.actions.handleError(error);
      } else {
        console.log('Other video status:', status);
      }
    });

    const playingSubscription = playerState.player.addListener('playingChange', ({ isPlaying }) => {
      console.log('Video playing state changed:', isPlaying);
      playerState.setters.setIsPlaying(isPlaying);
    });

    const timeUpdateSubscription = playerState.player.addListener('timeUpdate', ({ currentTime: time }) => {
      setCurrentTime(time);
      // Update duration if it becomes available after initial readyToPlay
      const d = playerState.player!.duration;
      if (isFinite(d) && d > 0) {
        setDuration(d);
      }
    });

    return () => {
      console.log('Cleaning up video player status listener');
      statusSubscription?.remove();
      playingSubscription?.remove();
      timeUpdateSubscription?.remove();
    };
  }, [playerState.player, playerState.setters, playerState.controls, errorHandling.actions, controls.actions, startPosition]);

  // Adopt an already-running player (expanding from the mini bar): its
  // statusChange event won't re-fire for a player that is already ready, so
  // read the current state synchronously instead of waiting on the listener.
  useEffect(() => {
    const player = playerState.player;
    if (!player || player.status !== 'readyToPlay') return;
    playerState.setters.setIsLoading(false);
    playerState.setters.setIsPlaying(player.playing);
    setIsLive(player.isLive);
    setCurrentTime(player.currentTime);
    const d = player.duration;
    if (isFinite(d) && d > 0) {
      setDuration(d);
    }
  }, [playerState.player, playerState.setters]);

  // Network state monitoring for error recovery
  useEffect(() => {
    if (
      network.networkState.isConnected &&
      errorHandling.hasError &&
      errorHandling.error?.type === 'NETWORK_ERROR'
    ) {
      console.log('Network connection restored, error can be retried');
    }
  }, [
    network.networkState.isConnected,
    errorHandling.hasError,
    errorHandling.error?.type,
  ]);

  // Register stop function
  useEffect(() => {
    onRegisterStopFunction?.(stopVideo);
  }, [onRegisterStopFunction, stopVideo]);

  // Focus effect handling
  useFocusEffect(
    useCallback(() => {
      console.log('Focus effect setup');
      return () => {
        // Backing out into the mini bar must keep playing — only pause when
        // the screen loses focus with the session still in fullscreen mode.
        if (usePlaybackSessionStore.getState().session?.mode === 'mini') return;
        console.log('Focus effect cleanup - pausing video');
        try {
          if (!isUnmountedRef.current && playerState.player) {
            playerState.controls.pauseVideo();
          }
        } catch (error) {
          console.warn('Error pausing video on focus loss:', error);
        }
        onStopVideo?.();
      };
    }, [playerState.player, playerState.controls, onStopVideo])
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
