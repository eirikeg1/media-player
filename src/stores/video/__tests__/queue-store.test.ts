/**
 * Tests for the playback queue store — pure queue navigation logic.
 */
import { usePlaybackQueueStore, type PlaybackQueueItem } from '@/stores/video/queue-store';
import { makeChannel } from '@/test/factories';
import { resetStores } from '@/test/helpers';

function makeQueueItem(name: string): PlaybackQueueItem {
  const channel = makeChannel({ name });
  return { channelId: `${channel.name}|${channel.url}`, channel };
}

const items = [makeQueueItem('Alpha'), makeQueueItem('Bravo'), makeQueueItem('Charlie')];

beforeEach(() => {
  resetStores(usePlaybackQueueStore);
});

describe('initial state', () => {
  it('starts empty with no current item', () => {
    const state = usePlaybackQueueStore.getState();
    expect(state.items).toEqual([]);
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
    expect(state.items).toEqual(items);
    expect(state.currentIndex).toBe(1);
  });
});

describe('goNext', () => {
  it('advances to and returns the next item', () => {
    usePlaybackQueueStore.getState().setQueue(items, 0);

    const next = usePlaybackQueueStore.getState().goNext();

    expect(next).toBe(items[1]);
    expect(usePlaybackQueueStore.getState().currentIndex).toBe(1);
  });

  it('wraps from the last item back to the first', () => {
    usePlaybackQueueStore.getState().setQueue(items, items.length - 1);

    const next = usePlaybackQueueStore.getState().goNext();

    expect(next).toBe(items[0]);
    expect(usePlaybackQueueStore.getState().currentIndex).toBe(0);
  });

  it('returns null and stays put on a single-item queue', () => {
    usePlaybackQueueStore.getState().setQueue([items[0]], 0);

    expect(usePlaybackQueueStore.getState().goNext()).toBeNull();
    expect(usePlaybackQueueStore.getState().currentIndex).toBe(0);
  });
});

describe('goPrevious', () => {
  it('moves back to and returns the previous item', () => {
    usePlaybackQueueStore.getState().setQueue(items, 2);

    const previous = usePlaybackQueueStore.getState().goPrevious();

    expect(previous).toBe(items[1]);
    expect(usePlaybackQueueStore.getState().currentIndex).toBe(1);
  });

  it('wraps from the first item to the last', () => {
    usePlaybackQueueStore.getState().setQueue(items, 0);

    const previous = usePlaybackQueueStore.getState().goPrevious();

    expect(previous).toBe(items[items.length - 1]);
    expect(usePlaybackQueueStore.getState().currentIndex).toBe(items.length - 1);
  });

  it('returns null and stays put on a single-item queue', () => {
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
    expect(state.items).toEqual([]);
    expect(state.currentIndex).toBe(-1);
  });
});
