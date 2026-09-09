/**
 * Tests for the playback queue store — pure queue navigation logic.
 */
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
  it('restores the initial empty state', () => {
    usePlaybackQueueStore.getState().setQueue(items, 2);

    usePlaybackQueueStore.getState().reset();

    const state = usePlaybackQueueStore.getState();
    expect(state.channels).toEqual([]);
    expect(state.currentIndex).toBe(-1);
  });
});
