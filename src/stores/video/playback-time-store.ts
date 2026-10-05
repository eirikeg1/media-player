import { create } from 'zustand';

/**
 * The active session's timeline, published by the single `timeUpdate` /
 * `playingChange` subscription in `PlaybackSessionHost`.
 *
 * Nothing else subscribes to the native player for these: the video screen,
 * its controls and the mini bar each select the one field they show, so a tick
 * only re-renders what actually displays it. Duplicated subscriptions (screen
 * *and* host, twice a second) is what made playback stutter on channel change.
 */
interface PlaybackTimeState {
  currentTime: number;
  /** Last known finite duration, or 0 for a stream that reports none (live). */
  duration: number;
  isPlaying: boolean;

  /**
   * Publish a `timeUpdate`. A non-finite or zero `duration` keeps the last
   * known one: expo-video reports the duration late, and only once.
   */
  publishTime: (currentTime: number, duration: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  reset: () => void;
}

const initialState = {
  currentTime: 0,
  duration: 0,
  isPlaying: false,
};

export const usePlaybackTimeStore = create<PlaybackTimeState>((set) => ({
  ...initialState,

  publishTime: (currentTime, duration) =>
    set((state) => {
      const nextDuration = isFinite(duration) && duration > 0 ? duration : state.duration;
      return state.currentTime === currentTime && state.duration === nextDuration
        ? state
        : { currentTime, duration: nextDuration };
    }),

  setIsPlaying: (isPlaying) =>
    set((state) => (state.isPlaying === isPlaying ? state : { isPlaying })),

  reset: () => set(initialState),
}));
