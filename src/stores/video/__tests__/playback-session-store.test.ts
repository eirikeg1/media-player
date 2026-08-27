/**
 * Tests for the playback session store — the session state machine that owns
 * the app-wide VideoPlayer (start/minimize/expand/end, replace-while-active).
 */
import { getChannelId } from '@/lib/channel-utils';
import {
  buildVideoSource,
  sessionMatches,
  usePlaybackSessionStore,
} from '@/stores/video/playback-session-store';
import { useVideoPlayerStore } from '@/stores/video/player-store';
import { usePlaybackQueueStore } from '@/stores/video/queue-store';
import { makeChannel } from '@/test/factories';
import { resetStores } from '@/test/helpers';

// Hoisted above the imports by jest; the factory runs lazily on first import
// of expo-video, so referencing the mock variable is safe.
const mockCreateVideoPlayer = jest.fn();

jest.mock('expo-video', () => ({
  createVideoPlayer: (...args: unknown[]) => mockCreateVideoPlayer(...args),
}));

function makeFakePlayer() {
  return {
    loop: true,
    muted: true,
    timeUpdateEventInterval: 0,
    pause: jest.fn(),
    release: jest.fn(),
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  mockCreateVideoPlayer.mockImplementation(() => makeFakePlayer());
  resetStores(usePlaybackSessionStore, usePlaybackQueueStore, useVideoPlayerStore);
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

const start = (channel = makeChannel()) => {
  usePlaybackSessionStore.getState().startSession({
    channel,
    playlistId: 'pl-1',
    contentType: 'live',
  });
  return channel;
};

describe('startSession', () => {
  it('creates a configured player and a fullscreen session', () => {
    const channel = start();

    const session = usePlaybackSessionStore.getState().session;
    expect(session).not.toBeNull();
    expect(session?.channel).toBe(channel);
    expect(session?.mode).toBe('fullscreen');
    expect(session?.screenViewAttached).toBe(false);
    expect(mockCreateVideoPlayer).toHaveBeenCalledWith({ uri: channel.url });
    // Player defaults applied
    expect(session?.player.loop).toBe(false);
    expect(session?.player.muted).toBe(false);
    expect(session?.player.timeUpdateEventInterval).toBe(0.5);
    // Registered globally for legacy consumers
    expect(useVideoPlayerStore.getState().player).toBe(session?.player);
  });

  it('replaces an existing session, releasing the old player', () => {
    start();
    const oldPlayer = usePlaybackSessionStore.getState().session!.player;

    start();
    jest.runOnlyPendingTimers();

    expect(oldPlayer.pause).toHaveBeenCalled();
    expect(oldPlayer.release).toHaveBeenCalled();
    expect(usePlaybackSessionStore.getState().session?.player).not.toBe(oldPlayer);
  });
});

describe('minimize / expand', () => {
  it('toggles the presentation mode without touching the player', () => {
    start();
    const player = usePlaybackSessionStore.getState().session!.player;

    usePlaybackSessionStore.getState().minimize();
    expect(usePlaybackSessionStore.getState().session?.mode).toBe('mini');

    usePlaybackSessionStore.getState().expand();
    expect(usePlaybackSessionStore.getState().session?.mode).toBe('fullscreen');

    expect(player.pause).not.toHaveBeenCalled();
    expect(player.release).not.toHaveBeenCalled();
  });

  it('is a no-op without a session', () => {
    usePlaybackSessionStore.getState().minimize();
    usePlaybackSessionStore.getState().expand();
    expect(usePlaybackSessionStore.getState().session).toBeNull();
  });
});

describe('endSession', () => {
  it('pauses immediately, releases deferred, and clears session state', () => {
    start();
    const player = usePlaybackSessionStore.getState().session!.player;
    usePlaybackQueueStore.getState().setQueue(
      [{ channelId: 'a', channel: makeChannel() }],
      0
    );

    usePlaybackSessionStore.getState().endSession();

    expect(usePlaybackSessionStore.getState().session).toBeNull();
    expect(useVideoPlayerStore.getState().player).toBeNull();
    // The queue belongs to the session
    expect(usePlaybackQueueStore.getState().items).toEqual([]);
    expect(player.pause).toHaveBeenCalled();
    // Release is deferred a tick so attached views can unmount first
    expect(player.release).not.toHaveBeenCalled();
    jest.runOnlyPendingTimers();
    expect(player.release).toHaveBeenCalled();
  });

  it('is a no-op without a session', () => {
    expect(() => usePlaybackSessionStore.getState().endSession()).not.toThrow();
  });
});

describe('setScreenViewAttached', () => {
  it('tracks the screen view attachment on the session', () => {
    start();
    usePlaybackSessionStore.getState().setScreenViewAttached(true);
    expect(usePlaybackSessionStore.getState().session?.screenViewAttached).toBe(true);
    usePlaybackSessionStore.getState().setScreenViewAttached(false);
    expect(usePlaybackSessionStore.getState().session?.screenViewAttached).toBe(false);
  });
});

describe('sessionMatches', () => {
  it('matches only the same channel in the same playlist', () => {
    const channel = start();
    const session = usePlaybackSessionStore.getState().session;

    expect(sessionMatches(session, getChannelId(channel), 'pl-1')).toBe(true);
    expect(sessionMatches(session, getChannelId(channel), 'pl-2')).toBe(false);
    expect(sessionMatches(session, 'other-channel', 'pl-1')).toBe(false);
    expect(sessionMatches(null, getChannelId(channel), 'pl-1')).toBe(false);
  });
});

describe('buildVideoSource', () => {
  it('is a plain uri without channel HTTP headers', () => {
    const channel = makeChannel();
    expect(buildVideoSource(channel)).toEqual({ uri: channel.url });
  });

  it('forwards User-Agent and Referer when present', () => {
    const channel = makeChannel({
      http: { userAgent: 'MyUA/1.0', referrer: 'https://ref.example' },
    });
    expect(buildVideoSource(channel)).toEqual({
      uri: channel.url,
      headers: { 'User-Agent': 'MyUA/1.0', Referer: 'https://ref.example' },
    });
  });
});
