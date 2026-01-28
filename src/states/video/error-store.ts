import type { RetryState, VideoError } from '@/components/domain/video/types/video-error.types';
import { create } from 'zustand';

interface VideoErrorState {
  // Error state
  hasError: boolean;
  error: VideoError | null;

  // Retry state
  retryState: RetryState;

  // Actions
  setError: (error: VideoError | null) => void;
  clearError: () => void;
  setRetryState: (retryState: Partial<RetryState>) => void;
  incrementRetryAttempt: () => void;
  resetRetryState: () => void;
  reset: () => void;
}

const initialRetryState: RetryState = {
  attempt: 0,
  maxAttempts: 3,
  baseDelay: 1000,
  isRetrying: false,
};

const initialState = {
  hasError: false,
  error: null,
  retryState: initialRetryState,
};

export const useVideoErrorStore = create<VideoErrorState>((set, get) => ({
  ...initialState,

  setError: (error) => set({
    hasError: !!error,
    error
  }),

  clearError: () => set({
    hasError: false,
    error: null
  }),

  setRetryState: (newRetryState) => set((state) => ({
    retryState: { ...state.retryState, ...newRetryState }
  })),

  incrementRetryAttempt: () => set((state) => ({
    retryState: {
      ...state.retryState,
      attempt: state.retryState.attempt + 1
    }
  })),

  resetRetryState: () => set({
    retryState: initialRetryState
  }),

  reset: () => set(initialState),
}));