import { create } from 'zustand';
import type { VideoPlayer } from 'expo-video';

interface VideoPlayerState {
  // Player instance
  player: VideoPlayer | null;

  // Playback state
  isPlaying: boolean;
  isLoading: boolean;
  loadingStage: 'connecting' | 'buffering' | 'preparing';
  loadingProgress?: number;

  // Actions
  setPlayer: (player: VideoPlayer | null) => void;
  setIsPlaying: (playing: boolean) => void;
  setIsLoading: (loading: boolean) => void;
  setLoadingStage: (stage: 'connecting' | 'buffering' | 'preparing') => void;
  setLoadingProgress: (progress?: number) => void;
  reset: () => void;
}

const initialState = {
  player: null,
  isPlaying: false,
  isLoading: true,
  loadingStage: 'connecting' as const,
  loadingProgress: undefined,
};

export const useVideoPlayerStore = create<VideoPlayerState>((set) => ({
  ...initialState,

  setPlayer: (player) => set({ player }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setLoadingStage: (loadingStage) => set({ loadingStage }),
  setLoadingProgress: (loadingProgress) => set({ loadingProgress }),
  reset: () => set(initialState),
}));