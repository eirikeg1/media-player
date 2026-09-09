import type { Fixture } from 'expo-m3u-parser';
import { createVideoPlayer, type VideoPlayer, type VideoSource } from 'expo-video';
import { create } from 'zustand';

import { CONNECTION_RELEASE_DELAY_MS } from '@/features/video/constants';
import { getChannelId } from '@/lib/channel-utils';
import { sameCatchupWindow, type CatchupWindow } from '@/types/playback.types';
import type { Channel } from '@/types/playlist.types';
import type { ContentType } from '@/types/user.types';
import { usePlaybackQueueStore } from './queue-store';

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
}

interface StartSessionArgs {
  channel: Channel;
  playlistId: string;
  contentType: ContentType;
  fixture?: Fixture | null;
  startPosition?: number;
  /** Defaults to the channel's own URL (live playback). */
  streamUrl?: string;
  catchup?: CatchupWindow | null;
}

interface PlaybackSessionState {
  session: PlaybackSession | null;

  /** Replace any existing session with a fresh player for `channel`. */
  startSession: (args: StartSessionArgs) => void;
  /** Keep playing, presented as the mini bar instead of the full screen. */
  minimize: () => void;
  /** Present the session full screen again (expanding from the mini bar). */
  expand: () => void;
  /** Stop playback and release the native player. */
  endSession: () => void;
  setScreenViewAttached: (attached: boolean) => void;
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

/**
 * Whether `session` is already playing exactly this channel + playlist, in the
 * same catch-up window (or live on both sides).
 */
export function sessionMatches(
  session: PlaybackSession | null,
  channelId: string,
  playlistId: string,
  catchup: CatchupWindow | null = null
): session is PlaybackSession {
  return (
    !!session &&
    session.playlistId === playlistId &&
    getChannelId(session.channel) === channelId &&
    sameCatchupWindow(session.catchup, catchup)
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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The single app-wide playback session. It is the sole owner of the
 * `VideoPlayer` instance — created with `createVideoPlayer`, released only
 * when the session ends or is replaced — so playback outlives the video
 * screen: backing out minimizes the session into the mini player bar instead
 * of stopping it.
 */
export const usePlaybackSessionStore = create<PlaybackSessionState>((set, get) => ({
  session: null,

  startSession: ({
    channel,
    playlistId,
    contentType,
    fixture = null,
    startPosition = 0,
    streamUrl = channel.url,
    catchup = null,
  }) => {
    const previous = get().session;

    // Created without a source: the outgoing player must free the panel's only
    // connection slot before this one opens its own. The source is attached in
    // the continuation below, which the screen covers with its loading overlay.
    const player = createVideoPlayer(null);
    player.loop = false;
    player.muted = false;
    player.timeUpdateEventInterval = 0.5;

    set({
      session: {
        player,
        channel,
        streamUrl,
        catchup,
        playlistId,
        contentType,
        fixture,
        startPosition,
        mode: 'fullscreen',
        screenViewAttached: false,
      },
    });

    void (async () => {
      try {
        if (previous) {
          await teardownPlayer(previous.player);
          // Only a replaced session pays this: a cold start has no connection
          // to wait for.
          await wait(CONNECTION_RELEASE_DELAY_MS);
        }
        // A newer startSession (or endSession) took over while we waited; it
        // owns this player's teardown, so loading a source now would reopen
        // the connection it just freed.
        if (get().session?.player !== player) return;
        await player.replaceAsync(buildVideoSource(channel, streamUrl));
      } catch (error) {
        console.warn('[PlaybackSession] Failed to load stream:', error);
      }
    })();
  },

  minimize: () =>
    set((state) => (state.session ? { session: { ...state.session, mode: 'mini' } } : state)),

  expand: () =>
    set((state) => (state.session ? { session: { ...state.session, mode: 'fullscreen' } } : state)),

  endSession: () => {
    const { session } = get();
    if (!session) return;

    set({ session: null });
    usePlaybackQueueStore.getState().reset();
    void teardownPlayer(session.player);
  },

  setScreenViewAttached: (attached) =>
    set((state) =>
      state.session && state.session.screenViewAttached !== attached
        ? { session: { ...state.session, screenViewAttached: attached } }
        : state
    ),
}));
