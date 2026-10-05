/**
 * Tests for the playback session store — the session state machine that owns
 * the app-wide VideoPlayer (start/minimize/expand/end, replace-while-active).
 */
import {
  CONNECTION_RELEASE_DELAY_MS,
  TIME_UPDATE_INTERVAL_SECONDS,
} from '@/features/video/constants';
import {
  VideoErrorType,
  type VideoError,
} from '@/features/video/types/video-error.types';
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
    play: jest.fn(),
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
const ARCHIVE_URL = 'http://panel.example.com/timeshift/u/p/150/2026-06-13:15-25/42.ts';

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
    expect(session?.error).toBeNull();
    // Sourceless: the source is attached only once the previous connection is free.
    expect(session?.sourceAttached).toBe(false);
    expect(mockCreateVideoPlayer).toHaveBeenCalledWith(null);
    // Player defaults applied
    expect(session?.player.loop).toBe(false);
    expect(session?.player.muted).toBe(false);
    expect(session?.player.timeUpdateEventInterval).toBe(TIME_UPDATE_INTERVAL_SECONDS);
  });

  it('attaches the source immediately on a cold start', async () => {
    const channel = start();
    const player = sessionPlayer();

    // No previous connection to wait for: no release delay is paid.
    await settle();

    expect(player.replaceAsync).toHaveBeenCalledWith({ uri: channel.url });
    // Recorded, so an idle player is known to be worth reloading.
    expect(usePlaybackSessionStore.getState().session?.sourceAttached).toBe(true);
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

  it('adopts the queue it is handed, by reference', () => {
    const queue = [makeChannel({ name: 'Alpha' }), makeChannel({ name: 'Bravo' })];

    usePlaybackSessionStore.getState().startSession({
      channel: queue[1],
      playlistId: 'pl-1',
      contentType: 'live',
      queue: { channels: queue, index: 1 },
    });

    expect(usePlaybackQueueStore.getState().channels).toBe(queue);
    expect(usePlaybackQueueStore.getState().currentIndex).toBe(1);
  });

  it('clears the previous queue when handed none', () => {
    const queue = [makeChannel({ name: 'Alpha' }), makeChannel({ name: 'Bravo' })];
    usePlaybackSessionStore.getState().startSession({
      channel: queue[0],
      playlistId: 'pl-1',
      contentType: 'live',
      queue: { channels: queue, index: 0 },
    });

    // A launch from somewhere with no queue of its own (a match, a movie): the
    // previous session's channels must not become its next/previous.
    start();

    expect(usePlaybackQueueStore.getState().channels).toEqual([]);
    expect(usePlaybackQueueStore.getState().currentIndex).toBe(-1);
  });

  it('waits out the release window even with no session to replace', async () => {
    start();
    await settle();

    // The panel does not free its only connection slot any faster just because
    // nothing is playing, so the teardown from endSession still has to be paid.
    usePlaybackSessionStore.getState().endSession();
    const channel = start();
    const player = sessionPlayer();

    await settle();
    expect(player.replaceAsync).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(CONNECTION_RELEASE_DELAY_MS);
    expect(player.replaceAsync).toHaveBeenCalledWith({ uri: channel.url });
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
    const target = { channelId: getChannelId(channel), playlistId: 'pl-1' };

    expect(sessionMatches(session, target)).toBe(true);
    expect(sessionMatches(session, { ...target, playlistId: 'pl-2' })).toBe(false);
    expect(sessionMatches(session, { ...target, channelId: 'other-channel' })).toBe(false);
    expect(sessionMatches(null, target)).toBe(false);
  });

  it('separates a live session from a catch-up window on the same channel', () => {
    const channel = start();
    const session = usePlaybackSessionStore.getState().session;

    expect(
      sessionMatches(session, {
        channelId: getChannelId(channel),
        playlistId: 'pl-1',
        catchup: CATCHUP,
      })
    ).toBe(false);
  });

  it('matches a catch-up session only on the exact same window', () => {
    const channel = makeChannel();
    usePlaybackSessionStore.getState().startSession({
      channel,
      playlistId: 'pl-1',
      contentType: 'live',
      streamUrl: ARCHIVE_URL,
      catchup: CATCHUP,
    });
    const session = usePlaybackSessionStore.getState().session;
    const target = { channelId: getChannelId(channel), playlistId: 'pl-1', catchup: CATCHUP };

    expect(sessionMatches(session, target)).toBe(true);
    expect(sessionMatches(session, { ...target, catchup: { ...CATCHUP, start: CATCHUP.start + 1 } })).toBe(
      false
    );
    expect(sessionMatches(session, { ...target, catchup: null })).toBe(false);
  });

  it('separates two sessions on the same channel that play different URLs', () => {
    // The catch-up → live hand-over: same channel, same (absent) window, but
    // the session is still on the archive URL, so it is not what the screen
    // now wants and must be replaced rather than expanded.
    const channel = makeChannel();
    usePlaybackSessionStore.getState().startSession({
      channel,
      playlistId: 'pl-1',
      contentType: 'live',
      streamUrl: ARCHIVE_URL,
    });
    const session = usePlaybackSessionStore.getState().session;
    const target = { channelId: getChannelId(channel), playlistId: 'pl-1' };

    expect(sessionMatches(session, { ...target, streamUrl: ARCHIVE_URL })).toBe(true);
    expect(sessionMatches(session, { ...target, streamUrl: channel.url })).toBe(false);
    // Omitted: any URL for this channel matches.
    expect(sessionMatches(session, target)).toBe(true);
  });
});

describe('setPictureInPicture', () => {
  it('tracks the picture-in-picture window on the session', () => {
    start();
    const player = usePlaybackSessionStore.getState().session!.player;
    expect(usePlaybackSessionStore.getState().session?.pip).toBe(false);

    usePlaybackSessionStore.getState().setPictureInPicture(player, true);
    expect(usePlaybackSessionStore.getState().session?.pip).toBe(true);

    usePlaybackSessionStore.getState().setPictureInPicture(player, false);
    expect(usePlaybackSessionStore.getState().session?.pip).toBe(false);
  });

  it("ignores a player that is no longer the session's", () => {
    start();
    const oldPlayer = usePlaybackSessionStore.getState().session!.player;
    start();

    // The exit event of the stream that was replaced must not window the new one.
    usePlaybackSessionStore.getState().setPictureInPicture(oldPlayer, true);

    expect(usePlaybackSessionStore.getState().session?.pip).toBe(false);
  });

  it('ends with the window when the session minimizes', () => {
    start();
    const player = usePlaybackSessionStore.getState().session!.player;
    usePlaybackSessionStore.getState().setPictureInPicture(player, true);

    // No stop event: the screen left while the window was up. The mini bar
    // must still appear, or the stream has no control left anywhere.
    usePlaybackSessionStore.getState().minimize();

    expect(usePlaybackSessionStore.getState().session).toMatchObject({ mode: 'mini', pip: false });
  });

  it("ends with the window when the screen's view detaches", () => {
    start();
    const player = usePlaybackSessionStore.getState().session!.player;
    usePlaybackSessionStore.getState().setScreenViewAttached(true);
    usePlaybackSessionStore.getState().setPictureInPicture(player, true);

    usePlaybackSessionStore.getState().setScreenViewAttached(false);

    expect(usePlaybackSessionStore.getState().session).toMatchObject({
      screenViewAttached: false,
      pip: false,
    });
  });
});

describe('setSessionError', () => {
  const ERROR: VideoError = {
    type: VideoErrorType.NETWORK_ERROR,
    title: 'Connection Issue',
    message: 'Unable to connect to the video stream',
    suggestion: 'Check your internet connection and try again',
    canRetry: true,
  };

  it('stores the error on the session so it survives the screen closing', () => {
    start();
    const player = usePlaybackSessionStore.getState().session!.player;

    usePlaybackSessionStore.getState().setSessionError(player, ERROR);

    expect(usePlaybackSessionStore.getState().session?.error).toBe(ERROR);
  });

  it('clears the error again', () => {
    start();
    const player = usePlaybackSessionStore.getState().session!.player;
    usePlaybackSessionStore.getState().setSessionError(player, ERROR);

    usePlaybackSessionStore.getState().setSessionError(player, null);

    expect(usePlaybackSessionStore.getState().session?.error).toBeNull();
  });

  it('ignores a player that is no longer the session\'s', () => {
    start();
    const oldPlayer = usePlaybackSessionStore.getState().session!.player;
    start();

    // A listener firing late must not mark the new stream as broken.
    usePlaybackSessionStore.getState().setSessionError(oldPlayer, ERROR);

    expect(usePlaybackSessionStore.getState().session?.error).toBeNull();
  });

  it('starts every session with no error', () => {
    start();
    const player = usePlaybackSessionStore.getState().session!.player;
    usePlaybackSessionStore.getState().setSessionError(player, ERROR);

    start();

    expect(usePlaybackSessionStore.getState().session?.error).toBeNull();
  });
});

describe('reloadSource', () => {
  it('clears the error and reloads what the session plays, with headers', async () => {
    const channel = makeChannel({ http: { userAgent: 'MyUA/1.0' } });
    usePlaybackSessionStore.getState().startSession({
      channel,
      playlistId: 'pl-1',
      contentType: 'live',
      streamUrl: ARCHIVE_URL,
      catchup: CATCHUP,
    });
    await settle();
    const player = sessionPlayer();

    await usePlaybackSessionStore.getState().reloadSource();

    // The archive URL, not the channel's own — reloading `channel.url` would
    // drop the viewer out of the window and onto the live stream.
    expect(player.replaceAsync).toHaveBeenLastCalledWith({
      uri: ARCHIVE_URL,
      headers: { 'User-Agent': 'MyUA/1.0' },
    });
    expect(usePlaybackSessionStore.getState().session?.error).toBeNull();
  });

  it('plays the reconnected stream and marks the source attached', async () => {
    start();
    await settle();
    const player = sessionPlayer();
    player.play.mockClear();

    await usePlaybackSessionStore.getState().reloadSource();

    // `replaceAsync` leaves the player paused, and a reload is always someone
    // asking to watch this again — nothing else would ever start it.
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(usePlaybackSessionStore.getState().session?.sourceAttached).toBe(true);
  });

  it('records an error when the reload fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    start();
    await settle();
    const player = sessionPlayer();
    player.replaceAsync.mockRejectedValueOnce(new Error('stream unavailable'));

    await usePlaybackSessionStore.getState().reloadSource();

    expect(usePlaybackSessionStore.getState().session?.error).not.toBeNull();
    warn.mockRestore();
  });

  it('is a no-op without a session', async () => {
    await expect(usePlaybackSessionStore.getState().reloadSource()).resolves.toBeUndefined();
  });
});

describe('catch-up sessions', () => {
  it('plays the archive URL while keeping the catalog channel', async () => {
    const channel = makeChannel();
    usePlaybackSessionStore.getState().startSession({
      channel,
      playlistId: 'pl-1',
      contentType: 'live',
      streamUrl: ARCHIVE_URL,
      catchup: CATCHUP,
    });
    await settle();

    const session = usePlaybackSessionStore.getState().session;
    // The channel keys history/favorites/route params, so it stays the catalog entry.
    expect(session?.channel).toBe(channel);
    expect(session?.streamUrl).toBe(ARCHIVE_URL);
    expect(session?.catchup).toEqual(CATCHUP);
    expect(sessionPlayer().replaceAsync).toHaveBeenCalledWith({ uri: ARCHIVE_URL });
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

    expect(buildVideoSource(channel, ARCHIVE_URL)).toEqual({
      uri: ARCHIVE_URL,
      headers: { 'User-Agent': 'MyUA/1.0' },
    });
  });
});
