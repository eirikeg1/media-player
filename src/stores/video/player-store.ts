import { create } from 'zustand';

/**
 * Cast state for the video screen. The `VideoPlayer` handle itself is NOT
 * mirrored here — `usePlaybackSessionStore.getState().session?.player` is its
 * single owner, so there is no second copy to go stale (a stale copy meant the
 * local player could not be unloaded before casting, leaving two connections
 * open against a panel that allows one).
 */
interface VideoPlayerState {
  isCasting: boolean;

  setIsCasting: (casting: boolean) => void;
  reset: () => void;
}

const initialState = {
  isCasting: false,
};

export const useVideoPlayerStore = create<VideoPlayerState>((set) => ({
  ...initialState,

  setIsCasting: (isCasting) => set({ isCasting }),
  reset: () => set(initialState),
}));
