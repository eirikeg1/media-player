/**
 * Tests for the published timeline — the one place the session player's
 * position, duration and playing state reach the rest of the app.
 */
import { usePlaybackTimeStore } from '@/stores/video/playback-time-store';
import { resetStores } from '@/test/helpers';

beforeEach(() => {
  resetStores(usePlaybackTimeStore);
});

describe('publishTime', () => {
  it('publishes the position and duration', () => {
    usePlaybackTimeStore.getState().publishTime(12, 90);

    expect(usePlaybackTimeStore.getState().currentTime).toBe(12);
    expect(usePlaybackTimeStore.getState().duration).toBe(90);
  });

  it('keeps the last known duration when the player reports none', () => {
    usePlaybackTimeStore.getState().publishTime(12, 90);

    // expo-video reports the duration late, and live streams report 0 or NaN
    // forever — neither may wipe a duration the seek bar is already drawn from.
    usePlaybackTimeStore.getState().publishTime(13, 0);
    expect(usePlaybackTimeStore.getState().duration).toBe(90);

    usePlaybackTimeStore.getState().publishTime(14, NaN);
    expect(usePlaybackTimeStore.getState().duration).toBe(90);

    usePlaybackTimeStore.getState().publishTime(15, Infinity);
    expect(usePlaybackTimeStore.getState().duration).toBe(90);
    expect(usePlaybackTimeStore.getState().currentTime).toBe(15);
  });

  it('keeps the same state object when nothing changed', () => {
    usePlaybackTimeStore.getState().publishTime(12, 90);
    const before = usePlaybackTimeStore.getState();

    usePlaybackTimeStore.getState().publishTime(12, 90);

    // A repeated tick must not re-render every subscriber.
    expect(usePlaybackTimeStore.getState()).toBe(before);
  });
});

describe('setIsPlaying', () => {
  it('tracks playback and ignores a repeated value', () => {
    usePlaybackTimeStore.getState().setIsPlaying(true);
    expect(usePlaybackTimeStore.getState().isPlaying).toBe(true);

    const before = usePlaybackTimeStore.getState();
    usePlaybackTimeStore.getState().setIsPlaying(true);
    expect(usePlaybackTimeStore.getState()).toBe(before);
  });
});

describe('reset', () => {
  it('clears the timeline for the next session', () => {
    usePlaybackTimeStore.getState().publishTime(120, 300);
    usePlaybackTimeStore.getState().setIsPlaying(true);

    usePlaybackTimeStore.getState().reset();

    const state = usePlaybackTimeStore.getState();
    expect(state.currentTime).toBe(0);
    expect(state.duration).toBe(0);
    expect(state.isPlaying).toBe(false);
  });
});
