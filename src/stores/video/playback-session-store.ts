import type { Fixture } from 'expo-m3u-parser';
import type { Href } from 'expo-router';
import { createVideoPlayer, type VideoPlayer, type VideoSource } from 'expo-video';
import { create } from 'zustand';

import { CONNECTION_RELEASE_DELAY_MS, TIME_UPDATE_INTERVAL_SECONDS } from '@/features/video/constants';
import { getVideoErrorInfo, type VideoError } from '@/features/video/types/video-error.types';
import { getChannelId } from '@/lib/channel-utils';
import { sameCatchupWindow, type CatchupWindow } from '@/types/playback.types';
import type { Channel } from '@/types/playlist.types';
import type { ContentType } from '@/types/user.types';
import { usePlaybackQueueStore, type QueueHandover } from './queue-store';

/** How the active playback session is currently presented. */
export type PlaybackMode = 'fullscreen' | 'mini';

export interface PlaybackSession {
  player: VideoPlayer;
  /**
   * The catalog channel. Its id keys viewing history, favorites and route
   * params, so it stays the catalog entry even when a catch-up window is
   * playing — only `streamUrl` differs then.
   */
  channel: Channel;
  /** The URL actually playing: the channel's own, or a catch-up window's. */
  streamUrl: string;
  /** The archive window being played, or null for the live stream. */
  catchup: CatchupWindow | null;
  playlistId: string;
  contentType: ContentType;
  /** Sports fixture carried along so expanding the mini bar restores match widgets. */
  fixture: Fixture | null;
  /**
   * The route playback was launched from — a detail surface, or null when it
   * was started from somewhere with nothing to come back to. Expanding the mini
   * bar puts it back underneath the player, so backing out of playback lands on
   * the title the viewer chose rather than on whatever tab they are on now.
   */
  origin: Href | null;
  /** Position playback started from (viewing-history bookkeeping). */
  startPosition: number;
  mode: PlaybackMode;
  /**
   * Whether the full-screen `VideoView` is attached to the player. Android
   * allows only one attached view per player, so the mini bar must wait for
   * the screen to detach before mounting its own view (and detach its own
   * before expanding back to the screen).
   */
  screenViewAttached: boolean;
  /**
   * Whether `streamUrl` has been handed to the player yet. A session starts
   * sourceless (the panel's only connection has to be freed first), so an
   * `idle` player is only worth reloading once this is true.
   */
  sourceAttached: boolean;
  /**
   * The playback error the session is currently in, or null. It lives on the
   * session rather than in screen state because a stream can fail while
   * minimized, with no video screen mounted to notice — the mini bar shows it
   * and the screen picks it up when it expands.
   */
  error: VideoError | null;
}

interface StartSessionArgs {
  channel: Channel;
  playlistId: string;
  contentType: ContentType;
  fixture?: Fixture | null;
  startPosition?: number;
  /** Defaults to the channel's own URL (live playback). */
  streamUrl?: string;
  /** The route that launched playback; omitted when there is none. */
  origin?: Href | null;
  catchup?: CatchupWindow | null;
  /**
   * Next/previous queue for this session. Omitted means "no queue": the
   * previous session's is cleared rather than inherited.
   */
  queue?: QueueHandover | null;
}

interface PlaybackSessionState {
  session: PlaybackSession | null;
  /**
   * Teardown of the player that last held the panel's connection, followed by
   * the release window. Not UI state — `startSession` awaits it so the next
   * stream never races the panel's single connection slot, even when the
   * session it belonged to is already gone.
   */
  connectionRelease: Promise<void> | null;

  /** Replace any existing session with a fresh player for `channel`. */
  startSession: (args: StartSessionArgs) => void;
  /** Keep playing, presented as the mini bar instead of the full screen. */
  minimize: () => void;
  /** Present the session full screen again (expanding from the mini bar). */
  expand: () => void;
  /** Stop playback and release the native player. */
  endSession: () => void;
  setScreenViewAttached: (attached: boolean) => void;
  /**
   * Record (or clear) the session's playback error. Ignored unless `player` is
   * still the session's, so a listener that fires after the session was
   * replaced cannot mark the new stream as broken.
   */
  setSessionError: (player: VideoPlayer, error: VideoError | null) => void;
  /**
   * Reload what the session is playing: the retry after an error, the resync of
   * a drifted live stream, and the recovery of an unloaded player are all the
   * same operation — reconnect the stream from scratch.
   */
  reloadSource: () => Promise<void>;
}

/**
 * Build the native source for a channel, forwarding its HTTP headers
 * (User-Agent / Referer). Many IPTV streams are header-gated and reject the
 * default player User-Agent with an IOException when these aren't sent.
 *
 * `streamUrl` overrides what is played (a catch-up window's URL); the headers
 * still come from the channel, since the archive is served by the same panel.
 */
export function buildVideoSource(channel: Channel, streamUrl: string = channel.url): VideoSource {
  const headers: Record<string, string> = {};
  if (channel.http?.userAgent) headers['User-Agent'] = channel.http.userAgent;
  if (channel.http?.referrer) headers['Referer'] = channel.http.referrer;
  return Object.keys(headers).length > 0 ? { uri: streamUrl, headers } : { uri: streamUrl };
}

/** What a caller wants playing: a channel in a playlist, live or on a window. */
export interface SessionTarget {
  channelId: string;
  playlistId: string;
  /** The archive window, or null/undefined for the live stream. */
  catchup?: CatchupWindow | null;
  /**
   * The exact URL that must be playing. Omitted matches any URL for the
   * channel — pass it whenever it is known, so a session still holding the
   * previous URL for this channel (a catch-up window handing over to live)
   * counts as a different session instead of one to expand.
   */
  streamUrl?: string | null;
}

/**
 * Whether `session` is already playing exactly this target: same channel and
 * playlist, same catch-up window (or live on both sides), same stream URL.
 */
export function sessionMatches(
  session: PlaybackSession | null,
  target: SessionTarget
): session is PlaybackSession {
  return (
    !!session &&
    session.playlistId === target.playlistId &&
    getChannelId(session.channel) === target.channelId &&
    sameCatchupWindow(session.catchup, target.catchup ?? null) &&
    (target.streamUrl == null || session.streamUrl === target.streamUrl)
  );
}

/**
 * Fully give up a player and the panel connection it holds.
 *
 * `pause()` alone leaves the socket open, which would keep the panel's only
 * connection slot occupied while the next stream tries to claim it —
 * `replaceAsync(null)` is what actually closes it (and frees the decoder).
 * Every step is guarded separately so a failing unload never skips `release()`.
 *
 * Callers clear or replace `session` synchronously first, so React has already
 * unmounted any `VideoView` bound to this player by the time `replaceAsync`
 * resolves.
 */
async function teardownPlayer(player: VideoPlayer): Promise<void> {
  try {
    player.pause();
  } catch (error) {
    console.warn('[PlaybackSession] Failed to pause player:', error);
  }
  try {
    await player.replaceAsync(null);
  } catch (error) {
    console.warn('[PlaybackSession] Failed to unload player:', error);
  }
  try {
    player.release();
  } catch (error) {
    console.warn('[PlaybackSession] Failed to release player:', error);
  }
}

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Give up `player` and wait out the window the panel needs to free its slot. */
function releaseConnection(player: VideoPlayer): Promise<void> {
  return teardownPlayer(player).then(() => wait(CONNECTION_RELEASE_DELAY_MS));
}

/**
 * The single app-wide playback session. It is the sole owner of the
 * `VideoPlayer` instance — created with `createVideoPlayer`, released only
 * when the session ends or is replaced — so playback outlives the video
 * screen: backing out minimizes the session into the mini player bar instead
 * of stopping it.
 */
export const usePlaybackSessionStore = create<PlaybackSessionState>((set, get) => ({
  session: null,
  connectionRelease: null,

  startSession: ({
    channel,
    playlistId,
    contentType,
    fixture = null,
    startPosition = 0,
    streamUrl = channel.url,
    catchup = null,
    queue = null,
    origin = null,
  }) => {
    const previous = get().session;
    const pendingRelease = get().connectionRelease;

    // Created without a source: the outgoing player must free the panel's only
    // connection slot before this one opens its own. The source is attached in
    // the continuation below, which the screen covers with its loading overlay.
    const player = createVideoPlayer(null);
    player.loop = false;
    player.muted = false;
    player.timeUpdateEventInterval = TIME_UPDATE_INTERVAL_SECONDS;

    // The queue belongs to the session, so it is replaced with it — never
    // inherited from whatever the last session was playing.
    const queueStore = usePlaybackQueueStore.getState();
    if (queue) queueStore.setQueue(queue.channels, queue.index);
    else queueStore.reset();

    set({
      session: {
        player,
        channel,
        streamUrl,
        catchup,
        playlistId,
        contentType,
        fixture,
        origin,
        startPosition,
        mode: 'fullscreen',
        screenViewAttached: false,
        sourceAttached: false,
        error: null,
      },
    });

    // Only now give up whatever holds the panel's connection — the outgoing
    // session, or a teardown still running from the session that ended before
    // this one. Replacing `session` first is what guarantees React has let go of
    // the `VideoView` bound to the outgoing player before it is unloaded.
    const connectionRelease = previous ? releaseConnection(previous.player) : pendingRelease;
    set({ connectionRelease });

    void (async () => {
      try {
        if (connectionRelease) await connectionRelease;
        // A newer startSession (or endSession) took over while we waited; it
        // owns this player's teardown, so loading a source now would reopen
        // the connection it just freed.
        if (get().session?.player !== player) return;
        await player.replaceAsync(buildVideoSource(channel, streamUrl));
        set((state) =>
          state.session && state.session.player === player
            ? { session: { ...state.session, sourceAttached: true } }
            : state
        );
      } catch (error) {
        // Recorded on the session so the screen (or the mini bar) shows an
        // error with a reload instead of a loading overlay that never clears.
        console.warn('[PlaybackSession] Failed to load stream:', error);
        get().setSessionError(
          player,
          getVideoErrorInfo(error instanceof Error ? error : new Error(String(error)))
        );
      }
    })();
  },

  // A mode it is already in changes nothing: handing out a new session object
  // for it re-renders every consumer (and re-runs their per-session effects).
  minimize: () =>
    set((state) =>
      state.session && state.session.mode !== 'mini'
        ? { session: { ...state.session, mode: 'mini' } }
        : state
    ),

  expand: () =>
    set((state) =>
      state.session && state.session.mode !== 'fullscreen'
        ? { session: { ...state.session, mode: 'fullscreen' } }
        : state
    ),

  endSession: () => {
    const { session } = get();
    if (!session) return;

    // Cleared first, so React unmounts any attached VideoView before the native
    // player is torn down. The release is remembered so the *next* session waits
    // it out too: the panel does not free its only connection slot any faster
    // just because nothing is playing.
    set({ session: null });
    usePlaybackQueueStore.getState().reset();
    set({ connectionRelease: releaseConnection(session.player) });
  },

  setScreenViewAttached: (attached) =>
    set((state) =>
      state.session && state.session.screenViewAttached !== attached
        ? { session: { ...state.session, screenViewAttached: attached } }
        : state
    ),

  setSessionError: (player, error) =>
    set((state) =>
      state.session && state.session.player === player && state.session.error !== error
        ? { session: { ...state.session, error } }
        : state
    ),

  reloadSource: async () => {
    const session = get().session;
    if (!session) return;
    const { player, channel, streamUrl } = session;
    get().setSessionError(player, null);
    try {
      await player.replaceAsync(buildVideoSource(channel, streamUrl));
      // A reload is always someone asking to watch this again — a retry, a
      // resync, or the app coming back to the foreground — and `replaceAsync`
      // leaves the player paused, so nothing else would ever start it. The
      // source is on the player now, which is what makes it worth reloading.
      set((state) =>
        state.session && state.session.player === player && !state.session.sourceAttached
          ? { session: { ...state.session, sourceAttached: true } }
          : state
      );
      if (get().session?.player === player) player.play();
    } catch (error) {
      console.warn('[PlaybackSession] Failed to reload stream:', error);
      get().setSessionError(player, getVideoErrorInfo(error instanceof Error ? error : new Error(String(error))));
    }
  },
}));
