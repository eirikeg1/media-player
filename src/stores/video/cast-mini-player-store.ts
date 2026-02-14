import { create } from 'zustand';

import type { Channel } from '@/types/playlist.types';
import type { ContentType } from '@/types/user.types';

interface CastMiniPlayerState {
  channel: Channel | null;
  playlistId: string | null;
  contentType: ContentType | null;

  activate: (channel: Channel, playlistId: string, contentType: ContentType) => void;
  dismiss: () => void;
}

const initialState = {
  channel: null,
  playlistId: null,
  contentType: null as ContentType | null,
};

export const useCastMiniPlayerStore = create<CastMiniPlayerState>((set) => ({
  ...initialState,

  activate: (channel, playlistId, contentType) => set({ channel, playlistId, contentType }),
  dismiss: () => set(initialState),
}));
