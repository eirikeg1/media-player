import { create } from 'zustand';
import type { Channel } from '@/types/playlist.types';

/** A queue a launching screen hands over to the session it is about to start. */
export interface QueueHandover {
  channels: Channel[];
  index: number;
}

/** A {@link QueueHandover} waiting for the channel it was staged for to start. */
interface StagedQueue extends QueueHandover {
  /** The channel whose launch this queue belongs to. */
  channelId: string;
}

/**
 * Next/previous navigation for the active playback session.
 *
 * The queue holds the caller's own channel array by reference — never a copy
 * or per-item wrappers — so opening a channel from a fully loaded catalog
 * costs nothing beyond the reference itself.
 *
 * It belongs to the session, and only `startSession` writes it: a launching
 * screen *stages* its queue and the session adopts it (see `stageQueue`). A
 * screen that stages nothing therefore starts with no queue instead of
 * inheriting the previous session's — which is how next/previous used to jump
 * from a movie into a list of live channels.
 *
 * A stage is keyed by the channel it was staged for, because staging happens a
 * navigation before playback does: the Live grid stages as it opens a channel's
 * detail sheet, and abandoning that sheet without pressing play would otherwise
 * leave the grid's queue lying in wait for whatever started next.
 */
interface PlaybackQueueState {
  channels: Channel[];
  currentIndex: number;
  /** Staged by a launching screen, consumed once by the session it starts. */
  staged: StagedQueue | null;

  /**
   * Offer a queue to the session about to start for `channelId`.
   *
   * @param channelId The channel the caller is opening — what the queue is for.
   */
  stageQueue: (channelId: string, channels: Channel[], index: number) => void;
  /**
   * Take the queue staged for `channelId`, if that is what was staged.
   *
   * Always consumes the stage: a launch never sees it twice, and a stage left
   * behind by an abandoned navigation is discarded rather than inherited.
   */
  takeStagedQueue: (channelId: string) => QueueHandover | null;
  setQueue: (channels: Channel[], currentIndex: number) => void;
  goNext: () => Channel | null;
  goPrevious: () => Channel | null;
  reset: () => void;
}

const initialState = {
  channels: [] as Channel[],
  currentIndex: -1,
  staged: null as StagedQueue | null,
};

export const usePlaybackQueueStore = create<PlaybackQueueState>((set, get) => ({
  ...initialState,

  stageQueue: (channelId, channels, index) => set({ staged: { channelId, channels, index } }),

  takeStagedQueue: (channelId) => {
    const { staged } = get();
    if (!staged) return null;
    set({ staged: null });
    if (staged.channelId !== channelId) return null;
    return { channels: staged.channels, index: staged.index };
  },

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
