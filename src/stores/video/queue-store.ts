import { create } from 'zustand';
import type { Channel } from '@/types/playlist.types';

export interface PlaybackQueueItem {
  channelId: string;
  channel: Channel;
}

interface PlaybackQueueState {
  items: PlaybackQueueItem[];
  currentIndex: number;

  setQueue: (items: PlaybackQueueItem[], currentIndex: number) => void;
  goNext: () => PlaybackQueueItem | null;
  goPrevious: () => PlaybackQueueItem | null;
  reset: () => void;
}

const initialState = {
  items: [] as PlaybackQueueItem[],
  currentIndex: -1,
};

export const usePlaybackQueueStore = create<PlaybackQueueState>((set, get) => ({
  ...initialState,

  setQueue: (items, currentIndex) => set({ items, currentIndex }),

  goNext: () => {
    const { items, currentIndex } = get();
    if (items.length <= 1) return null;
    const nextIndex = (currentIndex + 1) % items.length;
    set({ currentIndex: nextIndex });
    return items[nextIndex];
  },

  goPrevious: () => {
    const { items, currentIndex } = get();
    if (items.length <= 1) return null;
    const prevIndex = (currentIndex - 1 + items.length) % items.length;
    set({ currentIndex: prevIndex });
    return items[prevIndex];
  },

  reset: () => set(initialState),
}));
