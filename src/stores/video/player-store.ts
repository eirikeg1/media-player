import { create } from 'zustand';
import type { VideoPlayer } from 'expo-video';

interface VideoPlayerState {
  player: VideoPlayer | null;
  isCasting: boolean;

  setPlayer: (player: VideoPlayer | null) => void;
  setIsCasting: (casting: boolean) => void;
  reset: () => void;
}

const initialState = {
  player: null,
  isCasting: false,
};

export const useVideoPlayerStore = create<VideoPlayerState>((set) => ({
  ...initialState,

  setPlayer: (player) => set({ player }),
  setIsCasting: (isCasting) => set({ isCasting }),
  reset: () => set(initialState),
}));
