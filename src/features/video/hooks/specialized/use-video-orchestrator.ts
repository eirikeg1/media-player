import type { Channel } from '@/types/playlist.types';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef } from 'react';
import { getVideoErrorInfo } from '../../types/video-error.types';
import { useVideoControls } from './use-video-controls';
import { useVideoErrorHandling } from './use-video-error-handling';
import { useVideoNetwork } from './use-video-network';
import { useVideoPlayerState } from './use-video-player-state';

interface UseVideoOrchestratorProps {
  channel: Channel;
  onStopVideo?: () => void;
  onRegisterStopFunction?: (stopFn: () => void) => void;
}

export function useVideoOrchestrator({
  channel,
  onStopVideo,
  onRegisterStopFunction,
}: UseVideoOrchestratorProps) {
  const isUnmountedRef = useRef(false);
  const retryTimeoutRef = useRef<number | null>(null);

  // Specialized hooks
  const playerState = useVideoPlayerState({ channel });
  const errorHandling = useVideoErrorHandling();
  const controls = useVideoControls();
  const network = useVideoNetwork();

  // Enhanced stop function that coordinates all state
  const stopVideo = useCallback(() => {
    playerState.actions.stopVideo();
    controls.actions.clearHideControlsTimeout();
    onStopVideo?.();
  }, [playerState.actions, controls.actions, onStopVideo]);

  // Enhanced toggle with controls coordination
  const togglePlayPause = useCallback(() => {
    playerState.actions.togglePlayPause();
    controls.actions.scheduleHideControls();
  }, [playerState.actions, controls.actions]);

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
        playerState.actions.setIsLoading(true);
        playerState.actions.setLoadingStage('connecting');
        controls.actions.hideControls();
        playerState.actions.setIsPlaying(false);

        // Complete retry state update
        errorHandling.actions.completeRetry();

        // Trigger replay
        playerState.actions.replayVideo();
      }
    }, delay);
  }, [
    errorHandling.canRetry,
    errorHandling.actions,
    network.actions,
    playerState.actions,
    controls.actions,
  ]);

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
        playerState.actions.setLoadingStage('buffering');
        playerState.actions.setLoadingProgress(undefined);
      } else if (status === 'readyToPlay') {
        console.log('Video ready to play - auto starting');
        playerState.actions.setIsLoading(false);
        errorHandling.actions.onRetrySuccess();
        playerState.actions.playVideo();

        // Use a shorter timeout initially, then switch to temporary showing
        setTimeout(() => {
          if (!isUnmountedRef.current) {
            controls.actions.showControlsTemporarily(4000);
          }
        }, 500);
      } else if (status === 'error' || error) {
        console.log('Video error:', error);
        playerState.actions.setIsLoading(false);
        errorHandling.actions.handleError(error);
      } else {
        console.log('Other video status:', status);
      }
    });

    const playingSubscription = playerState.player.addListener('playingChange', ({ isPlaying }) => {
      console.log('Video playing state changed:', isPlaying);
      playerState.actions.setIsPlaying(isPlaying);
    });

    return () => {
      console.log('Cleaning up video player status listener');
      statusSubscription?.remove();
      playingSubscription?.remove();
    };
  }, [playerState.player]); // Only depend on the player itself, not the actions

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
        console.log('Focus effect cleanup - pausing video');
        try {
          if (!isUnmountedRef.current && playerState.player) {
            playerState.actions.pauseVideo();
          }
        } catch (error) {
          console.warn('Error pausing video on focus loss:', error);
        }
        onStopVideo?.();
      };
    }, [playerState.player, onStopVideo]) // Removed playerState.actions from deps
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
    retryPlayback,
    showControlsTemporarily: controls.actions.showControlsTemporarily,
    clearHideControlsTimeout: controls.actions.clearHideControlsTimeout,
    toggleControls: controls.actions.toggleControls,
  };
}