/**
 * Tests for the playback session store — the session state machine that owns
 * the app-wide VideoPlayer (start/minimize/expand/end, replace-while-active).
 */
import { CONNECTION_RELEASE_DELAY_MS } from '@/features/video/constants';
import { getChannelId } from '@/lib/channel-utils';
import {
  buildVideoSource,
  sessionMatches,
  usePlaybackSessionStore,
} from '@/stores/video/playback-session-store';
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
    replaceAsync: jest.fn().mockResolvedValue(undefined),
  };
}

/** The session's player, typed as the jest fake it actually is. */
const sessionPlayer = () =>
  usePlaybackSessionStore.getState().session!.player as unknown as ReturnType<
    typeof makeFakePlayer
  >;

/** Run the detached async continuations without advancing the release delay. */
const settle = () => jest.advanceTimersByTimeAsync(0);

beforeEach(() => {
  jest.useFakeTimers();
  mockCreateVideoPlayer.mockImplementation(() => makeFakePlayer());
  resetStores(usePlaybackSessionStore, usePlaybackQueueStore);
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

/** A match's archive window: kickoff − 5 min, 150 minutes long. */
const CATCHUP = { start: 1_781_357_100, durationMinutes: 150 };

const start = (channel = makeChannel()) => {
  usePlaybackSessionStore.getState().startSession({
    channel,
    playlistId: 'pl-1',
    contentType: 'live',
  });
  return channel;
};

describe('startSession', () => {
  it('creates a configured player and a fullscreen session synchronously', () => {
    const channel = start();

    const session = usePlaybackSessionStore.getState().session;
    expect(session).not.toBeNull();
    expect(session?.channel).toBe(channel);
    expect(session?.mode).toBe('fullscreen');
    expect(session?.screenViewAttached).toBe(false);
    // Sourceless: the source is attached only once the previous connection is free.
    expect(mockCreateVideoPlayer).toHaveBeenCalledWith(null);
    // Player defaults applied
    expect(session?.player.loop).toBe(false);
    expect(session?.player.muted).toBe(false);
    expect(session?.player.timeUpdateEventInterval).toBe(0.5);
  });

  it('attaches the source immediately on a cold start', async () => {
    const channel = start();
    const player = sessionPlayer();

    // No previous connection to wait for: no release delay is paid.
    await settle();

    expect(player.replaceAsync).toHaveBeenCalledWith({ uri: channel.url });
  });

  it('unloads and releases the outgoing player before the new one connects', async () => {
    start();
    const oldPlayer = sessionPlayer();

    const channel = start();
    const newPlayer = sessionPlayer();
    expect(newPlayer).not.toBe(oldPlayer);

    await settle();

    // The old player gave up the panel's only connection slot...
    expect(oldPlayer.pause).toHaveBeenCalled();
    expect(oldPlayer.replaceAsync).toHaveBeenCalledWith(null);
    expect(oldPlayer.release).toHaveBeenCalled();
    // ...and the new one has not claimed it yet — the panel needs time to free it.
    expect(newPlayer.replaceAsync).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(CONNECTION_RELEASE_DELAY_MS);

    expect(newPlayer.replaceAsync).toHaveBeenCalledWith({ uri: channel.url });
  });

  it('releases a player whose unload fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    start();
    const oldPlayer = sessionPlayer();
    oldPlayer.replaceAsync.mockRejectedValueOnce(new Error('native unload failed'));

    start();
    await settle();

    expect(oldPlayer.release).toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('never sources a player whose session was replaced during the release delay', async () => {
    start();
    start();
    const supersededPlayer = sessionPlayer();

    // A third start lands while the second is still waiting out the delay.
    await settle();
    const channel = start();
    await jest.advanceTimersByTimeAsync(CONNECTION_RELEASE_DELAY_MS * 2);

    // The superseded player only ever got torn down, never a source.
    expect(supersededPlayer.replaceAsync).toHaveBeenCalledTimes(1);
    expect(supersededPlayer.replaceAsync).toHaveBeenCalledWith(null);
    expect(supersededPlayer.release).toHaveBeenCalled();
    expect(sessionPlayer().replaceAsync).toHaveBeenCalledWith({ uri: channel.url });
  });

  it('never sources a player whose session ended during the release delay', async () => {
    start();
    start();
    const player = sessionPlayer();

    usePlaybackSessionStore.getState().endSession();
    await jest.advanceTimersByTimeAsync(CONNECTION_RELEASE_DELAY_MS * 2);

    expect(player.replaceAsync).not.toHaveBeenCalledWith({ uri: expect.any(String) });
    expect(player.release).toHaveBeenCalled();
  });

  it('keeps the queue set up by the launching screen', async () => {
    const queue = [makeChannel({ name: 'Alpha' }), makeChannel({ name: 'Bravo' })];
    usePlaybackQueueStore.getState().setQueue(queue, 0);

    start();
    await settle();

    expect(usePlaybackQueueStore.getState().channels).toBe(queue);
  });
});

describe('minimize / expand', () => {
  it('toggles the presentation mode without touching the player', () => {
    start();
    const player = sessionPlayer();

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
  it('clears the session synchronously, then unloads and releases the player', async () => {
    start();
    await settle();
    const player = sessionPlayer();
    usePlaybackQueueStore.getState().setQueue([makeChannel()], 0);

    usePlaybackSessionStore.getState().endSession();

    // Cleared first, so React unmounts any attached VideoView before the
    // native player is torn down.
    expect(usePlaybackSessionStore.getState().session).toBeNull();
    // The queue belongs to the session
    expect(usePlaybackQueueStore.getState().channels).toEqual([]);
    expect(player.pause).toHaveBeenCalled();

    await settle();

    // Unloading is what actually frees the panel's connection slot.
    expect(player.replaceAsync).toHaveBeenLastCalledWith(null);
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

  it('separates a live session from a catch-up window on the same channel', () => {
    const channel = start();
    const session = usePlaybackSessionStore.getState().session;

    expect(sessionMatches(session, getChannelId(channel), 'pl-1', CATCHUP)).toBe(false);
  });

  it('matches a catch-up session only on the exact same window', () => {
    const channel = makeChannel();
    usePlaybackSessionStore.getState().startSession({
      channel,
      playlistId: 'pl-1',
      contentType: 'live',
      streamUrl: 'http://panel.example.com/timeshift/u/p/150/2026-06-13:15-25/42.ts',
      catchup: CATCHUP,
    });
    const session = usePlaybackSessionStore.getState().session;

    expect(sessionMatches(session, getChannelId(channel), 'pl-1', CATCHUP)).toBe(true);
    expect(
      sessionMatches(session, getChannelId(channel), 'pl-1', { ...CATCHUP, start: CATCHUP.start + 1 })
    ).toBe(false);
    expect(sessionMatches(session, getChannelId(channel), 'pl-1')).toBe(false);
  });
});

describe('catch-up sessions', () => {
  it('plays the archive URL while keeping the catalog channel', async () => {
    const channel = makeChannel();
    const archiveUrl = 'http://panel.example.com/timeshift/u/p/150/2026-06-13:15-25/42.ts';
    usePlaybackSessionStore.getState().startSession({
      channel,
      playlistId: 'pl-1',
      contentType: 'live',
      streamUrl: archiveUrl,
      catchup: CATCHUP,
    });
    await settle();

    const session = usePlaybackSessionStore.getState().session;
    // The channel keys history/favorites/route params, so it stays the catalog entry.
    expect(session?.channel).toBe(channel);
    expect(session?.streamUrl).toBe(archiveUrl);
    expect(session?.catchup).toEqual(CATCHUP);
    expect(sessionPlayer().replaceAsync).toHaveBeenCalledWith({ uri: archiveUrl });
  });

  it('defaults to the channel URL and live playback', () => {
    const channel = start();
    const session = usePlaybackSessionStore.getState().session;

    expect(session?.streamUrl).toBe(channel.url);
    expect(session?.catchup).toBeNull();
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

  it('plays an overriding stream URL with the channel headers', () => {
    const channel = makeChannel({ http: { userAgent: 'MyUA/1.0' } });
    const archiveUrl = 'http://panel.example.com/timeshift/u/p/150/2026-06-13:15-25/42.ts';

    expect(buildVideoSource(channel, archiveUrl)).toEqual({
      uri: archiveUrl,
      headers: { 'User-Agent': 'MyUA/1.0' },
    });
  });
});
