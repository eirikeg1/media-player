import { create } from 'zustand';

import type { Channel } from '@/types/playlist.types';

interface CastMiniPlayerState {
  channel: Channel | null;
  playlistId: string | null;

  activate: (channel: Channel, playlistId: string) => void;
  dismiss: () => void;
}

const initialState = {
  channel: null,
  playlistId: null,
};

export const useCastMiniPlayerStore = create<CastMiniPlayerState>((set) => ({
  ...initialState,

  activate: (channel, playlistId) => set({ channel, playlistId }),
  dismiss: () => set(initialState),
}));
