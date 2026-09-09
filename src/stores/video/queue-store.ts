import { create } from 'zustand';
import type { Channel } from '@/types/playlist.types';

/**
 * Next/previous navigation for the active playback session.
 *
 * The queue holds the caller's own channel array by reference — never a copy
 * or per-item wrappers — so opening a channel from a fully loaded catalog
 * costs nothing beyond the reference itself.
 */
interface PlaybackQueueState {
  channels: Channel[];
  currentIndex: number;

  setQueue: (channels: Channel[], currentIndex: number) => void;
  goNext: () => Channel | null;
  goPrevious: () => Channel | null;
  reset: () => void;
}

const initialState = {
  channels: [] as Channel[],
  currentIndex: -1,
};

export const usePlaybackQueueStore = create<PlaybackQueueState>((set, get) => ({
  ...initialState,

  setQueue: (channels, currentIndex) => set({ channels, currentIndex }),

  goNext: () => {
    const { channels, currentIndex } = get();
    if (channels.length <= 1) return null;
    const nextIndex = (currentIndex + 1) % channels.length;
    set({ currentIndex: nextIndex });
    return channels[nextIndex];
  },

  goPrevious: () => {
    const { channels, currentIndex } = get();
    if (channels.length <= 1) return null;
    const prevIndex = (currentIndex - 1 + channels.length) % channels.length;
    set({ currentIndex: prevIndex });
    return channels[prevIndex];
  },

  reset: () => set(initialState),
}));
