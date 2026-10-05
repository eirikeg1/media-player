/**
 * Tests for the playback queue store — pure queue navigation logic.
 */
import { getChannelId } from '@/lib/channel-utils';
import { usePlaybackQueueStore } from '@/stores/video/queue-store';
import { makeChannel } from '@/test/factories';
import { resetStores } from '@/test/helpers';

const items = [
  makeChannel({ name: 'Alpha' }),
  makeChannel({ name: 'Bravo' }),
  makeChannel({ name: 'Charlie' }),
];

beforeEach(() => {
  resetStores(usePlaybackQueueStore);
});

describe('initial state', () => {
  it('starts empty with no current channel', () => {
    const state = usePlaybackQueueStore.getState();
    expect(state.channels).toEqual([]);
    expect(state.currentIndex).toBe(-1);
    expect(state.staged).toBeNull();
  });

  it('goNext and goPrevious return null on an empty queue', () => {
    expect(usePlaybackQueueStore.getState().goNext()).toBeNull();
    expect(usePlaybackQueueStore.getState().goPrevious()).toBeNull();
    expect(usePlaybackQueueStore.getState().currentIndex).toBe(-1);
  });
});

describe('setQueue', () => {
  it('replaces the queue and current index', () => {
    usePlaybackQueueStore.getState().setQueue(items, 1);

    const state = usePlaybackQueueStore.getState();
    expect(state.channels).toEqual(items);
    expect(state.currentIndex).toBe(1);
  });

  it("keeps the caller's array by reference instead of copying the catalog", () => {
    usePlaybackQueueStore.getState().setQueue(items, 0);

    expect(usePlaybackQueueStore.getState().channels).toBe(items);
  });
});

describe('stageQueue / takeStagedQueue', () => {
  const idOf = (channel: (typeof items)[number]) => getChannelId(channel);

  it("hands the launching screen's queue over exactly once", () => {
    usePlaybackQueueStore.getState().stageQueue(idOf(items[2]), items, 2);

    expect(usePlaybackQueueStore.getState().takeStagedQueue(idOf(items[2]))).toEqual({
      channels: items,
      index: 2,
    });
    // Consumed: a later launch that stages nothing must not pick this up.
    expect(usePlaybackQueueStore.getState().takeStagedQueue(idOf(items[2]))).toBeNull();
  });

  it('does not become the live queue until a session adopts it', () => {
    usePlaybackQueueStore.getState().stageQueue(idOf(items[1]), items, 1);

    expect(usePlaybackQueueStore.getState().channels).toEqual([]);
    expect(usePlaybackQueueStore.getState().currentIndex).toBe(-1);
  });

  it('is null when nothing was staged', () => {
    expect(usePlaybackQueueStore.getState().takeStagedQueue('anything')).toBeNull();
  });

  it('discards a stage left behind by a channel that never started', () => {
    // The Live grid stages as it opens a channel's detail sheet; backing out of
    // that sheet and playing something else must not inherit the grid's queue.
    usePlaybackQueueStore.getState().stageQueue(idOf(items[0]), items, 0);

    expect(usePlaybackQueueStore.getState().takeStagedQueue(idOf(items[2]))).toBeNull();
    // Discarded, not merely skipped: it cannot surface on a later launch either.
    expect(usePlaybackQueueStore.getState().staged).toBeNull();
  });
});

describe('goNext', () => {
  it('advances to and returns the next channel', () => {
    usePlaybackQueueStore.getState().setQueue(items, 0);

    const next = usePlaybackQueueStore.getState().goNext();

    expect(next).toBe(items[1]);
    expect(usePlaybackQueueStore.getState().currentIndex).toBe(1);
  });

  it('wraps from the last channel back to the first', () => {
    usePlaybackQueueStore.getState().setQueue(items, items.length - 1);

    const next = usePlaybackQueueStore.getState().goNext();

    expect(next).toBe(items[0]);
    expect(usePlaybackQueueStore.getState().currentIndex).toBe(0);
  });

  it('returns null and stays put on a single-channel queue', () => {
    usePlaybackQueueStore.getState().setQueue([items[0]], 0);

    expect(usePlaybackQueueStore.getState().goNext()).toBeNull();
    expect(usePlaybackQueueStore.getState().currentIndex).toBe(0);
  });
});

describe('goPrevious', () => {
  it('moves back to and returns the previous channel', () => {
    usePlaybackQueueStore.getState().setQueue(items, 2);

    const previous = usePlaybackQueueStore.getState().goPrevious();

    expect(previous).toBe(items[1]);
    expect(usePlaybackQueueStore.getState().currentIndex).toBe(1);
  });

  it('wraps from the first channel to the last', () => {
    usePlaybackQueueStore.getState().setQueue(items, 0);

    const previous = usePlaybackQueueStore.getState().goPrevious();

    expect(previous).toBe(items[items.length - 1]);
    expect(usePlaybackQueueStore.getState().currentIndex).toBe(items.length - 1);
  });

  it('returns null and stays put on a single-channel queue', () => {
    usePlaybackQueueStore.getState().setQueue([items[0]], 0);

    expect(usePlaybackQueueStore.getState().goPrevious()).toBeNull();
    expect(usePlaybackQueueStore.getState().currentIndex).toBe(0);
  });
});

describe('reset', () => {
  it('restores the initial empty state, staged handover included', () => {
    usePlaybackQueueStore.getState().setQueue(items, 2);
    usePlaybackQueueStore.getState().stageQueue(getChannelId(items[0]), items, 0);

    usePlaybackQueueStore.getState().reset();

    const state = usePlaybackQueueStore.getState();
    expect(state.channels).toEqual([]);
    expect(state.currentIndex).toBe(-1);
    expect(state.staged).toBeNull();
  });
});
