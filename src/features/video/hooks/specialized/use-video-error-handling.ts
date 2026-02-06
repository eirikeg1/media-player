import { useVideoErrorStore } from '@/states/video/error-store';
import { useCallback, useMemo } from 'react';
import { Alert } from 'react-native';
import { calculateRetryDelay, getVideoErrorInfo, type RawVideoError } from '../../types/video-error.types';

export function useVideoErrorHandling() {
  const {
    hasError,
    error,
    retryState,
    setError,
    clearError,
    setRetryState,
    incrementRetryAttempt,
    resetRetryState,
  } = useVideoErrorStore();

  const handleError = useCallback((rawError: RawVideoError) => {
    const enhancedError = getVideoErrorInfo(rawError, retryState.attempt);
    setError(enhancedError);

    // Only show alert for non-retryable errors or after max retries
    if (!enhancedError.canRetry || retryState.attempt >= retryState.maxAttempts) {
      Alert.alert(
        enhancedError.title,
        enhancedError.message + '\n\n' + enhancedError.suggestion,
        [{ text: 'OK' }]
      );
    }

    console.error('Video playback error:', rawError, 'Enhanced:', enhancedError);
  }, [retryState.attempt, retryState.maxAttempts, setError]);

  const canRetry = useCallback(() => {
    return !retryState.isRetrying &&
           retryState.attempt < retryState.maxAttempts &&
           error?.canRetry;
  }, [retryState.isRetrying, retryState.attempt, retryState.maxAttempts, error?.canRetry]);

  const getRetryDelay = useCallback(() => {
    return calculateRetryDelay(retryState.attempt, retryState.baseDelay);
  }, [retryState.attempt, retryState.baseDelay]);

  const startRetry = useCallback(() => {
    if (!canRetry()) return false;

    setRetryState({ isRetrying: true });
    return true;
  }, [canRetry, setRetryState]);

  const completeRetry = useCallback(() => {
    incrementRetryAttempt();
    setRetryState({ isRetrying: false });
  }, [incrementRetryAttempt, setRetryState]);

  const onRetrySuccess = useCallback(() => {
    clearError();
    resetRetryState();
  }, [clearError, resetRetryState]);

  const actions = useMemo(() => ({
    handleError,
    clearError,
    startRetry,
    completeRetry,
    onRetrySuccess,
    getRetryDelay,
  }), [
    handleError,
    clearError,
    startRetry,
    completeRetry,
    onRetrySuccess,
    getRetryDelay,
  ]);

  return useMemo(() => ({
    hasError,
    error,
    retryState,
    canRetry: canRetry(),
    actions,
  }), [
    hasError,
    error,
    retryState,
    canRetry,
    actions,
  ]);
}