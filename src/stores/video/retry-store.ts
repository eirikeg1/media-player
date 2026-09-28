import type { RetryState } from '@/features/video/types/video-error.types';
import { create } from 'zustand';

/**
 * Retry bookkeeping for the video screen.
 *
 * The error *itself* lives on the playback session
 * (`PlaybackSession.error`) — it has to outlive this screen so a stream that
 * fails while minimized can be shown in the mini bar. Only the attempt counter
 * and backoff, which are screen-lifetime concerns, live here.
 */
interface VideoRetryStoreState {
  retryState: RetryState;

  setRetryState: (retryState: Partial<RetryState>) => void;
  incrementRetryAttempt: () => void;
  reset: () => void;
}

const initialRetryState: RetryState = {
  attempt: 0,
  maxAttempts: 3,
  baseDelay: 1000,
  isRetrying: false,
};

export const useVideoRetryStore = create<VideoRetryStoreState>((set) => ({
  retryState: initialRetryState,

  setRetryState: (newRetryState) =>
    set((state) => ({ retryState: { ...state.retryState, ...newRetryState } })),

  incrementRetryAttempt: () =>
    set((state) => ({
      retryState: { ...state.retryState, attempt: state.retryState.attempt + 1 },
    })),

  reset: () => set({ retryState: initialRetryState }),
}));
