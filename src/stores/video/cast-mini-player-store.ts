import { create } from 'zustand';

import type { CatchupWindow } from '@/types/playback.types';
import type { Channel } from '@/types/playlist.types';
import type { ContentType } from '@/types/user.types';

interface CastMiniPlayerState {
  channel: Channel | null;
  playlistId: string | null;
  contentType: ContentType | null;
  /** The URL handed to the receiver: the channel's own, or a catch-up window's. */
  streamUrl: string | null;
  /** The archive window on the receiver, or null when it plays live. */
  catchup: CatchupWindow | null;

  activate: (
    channel: Channel,
    playlistId: string,
    contentType: ContentType,
    streamUrl: string,
    catchup: CatchupWindow | null
  ) => void;
  dismiss: () => void;
}

const initialState = {
  channel: null,
  playlistId: null,
  contentType: null as ContentType | null,
  streamUrl: null as string | null,
  catchup: null as CatchupWindow | null,
};

export const useCastMiniPlayerStore = create<CastMiniPlayerState>((set) => ({
  ...initialState,

  activate: (channel, playlistId, contentType, streamUrl, catchup) =>
    set({ channel, playlistId, contentType, streamUrl, catchup }),
  dismiss: () => set(initialState),
}));
