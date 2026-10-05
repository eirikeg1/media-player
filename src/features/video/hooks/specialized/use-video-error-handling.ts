import type { VideoPlayer } from 'expo-video';
import { useCallback, useMemo } from 'react';

import { usePlaybackSessionStore } from '@/stores/video/playback-session-store';
import { useVideoRetryStore } from '@/stores/video/retry-store';
import {
  calculateRetryDelay,
  getVideoErrorInfo,
  type RawVideoError,
} from '../../types/video-error.types';

/**
 * The video screen's view of playback failure: the error the session is in,
 * plus the retry budget for getting out of it.
 *
 * The error is read from — and written to — the session, not mirrored here: it
 * must survive this screen unmounting into the mini bar, and two copies of it
 * meant an error raised while minimized showed nothing on expand.
 */
export function useVideoErrorHandling(player: VideoPlayer | null) {
  const error = usePlaybackSessionStore((s) => s.session?.error ?? null);
  const retryState = useVideoRetryStore((s) => s.retryState);
  const setRetryState = useVideoRetryStore((s) => s.setRetryState);
  const incrementRetryAttempt = useVideoRetryStore((s) => s.incrementRetryAttempt);
  const resetRetryState = useVideoRetryStore((s) => s.reset);

  const handleError = useCallback(
    (rawError: RawVideoError) => {
      if (!player) return;
      const enhancedError = getVideoErrorInfo(rawError, retryState.attempt);
      console.error('Video playback error:', rawError, 'Enhanced:', enhancedError);
      // No alert: the error card *is* the UI for this, and an alert on every
      // status change stacked one dialog per failed retry on top of it.
      usePlaybackSessionStore.getState().setSessionError(player, enhancedError);
    },
    [player, retryState.attempt]
  );

  const clearError = useCallback(() => {
    if (!player) return;
    usePlaybackSessionStore.getState().setSessionError(player, null);
  }, [player]);

  const canRetry =
    !retryState.isRetrying && retryState.attempt < retryState.maxAttempts && !!error?.canRetry;

  const getRetryDelay = useCallback(
    () => calculateRetryDelay(retryState.attempt, retryState.baseDelay),
    [retryState.attempt, retryState.baseDelay]
  );

  const startRetry = useCallback(() => {
    setRetryState({ isRetrying: true });
  }, [setRetryState]);

  const completeRetry = useCallback(() => {
    incrementRetryAttempt();
    setRetryState({ isRetrying: false });
  }, [incrementRetryAttempt, setRetryState]);

  const onRetrySuccess = useCallback(() => {
    clearError();
    resetRetryState();
  }, [clearError, resetRetryState]);

  const actions = useMemo(
    () => ({
      handleError,
      clearError,
      startRetry,
      completeRetry,
      onRetrySuccess,
      getRetryDelay,
    }),
    [handleError, clearError, startRetry, completeRetry, onRetrySuccess, getRetryDelay]
  );

  return useMemo(
    () => ({
      hasError: !!error,
      error,
      retryState,
      canRetry,
      actions,
    }),
    [error, retryState, canRetry, actions]
  );
}
