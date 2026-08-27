import type { Fixture } from 'expo-m3u-parser';
import { createVideoPlayer, type VideoPlayer, type VideoSource } from 'expo-video';
import { create } from 'zustand';

import { getChannelId } from '@/lib/channel-utils';
import type { Channel } from '@/types/playlist.types';
import type { ContentType } from '@/types/user.types';
import { useVideoPlayerStore } from './player-store';
import { usePlaybackQueueStore } from './queue-store';

/** How the active playback session is currently presented. */
export type PlaybackMode = 'fullscreen' | 'mini';

export interface PlaybackSession {
  player: VideoPlayer;
  channel: Channel;
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
 */
export function buildVideoSource(channel: Channel): VideoSource {
  const headers: Record<string, string> = {};
  if (channel.http?.userAgent) headers['User-Agent'] = channel.http.userAgent;
  if (channel.http?.referrer) headers['Referer'] = channel.http.referrer;
  return Object.keys(headers).length > 0 ? { uri: channel.url, headers } : { uri: channel.url };
}

/** Whether `session` is already playing exactly this channel + playlist. */
export function sessionMatches(
  session: PlaybackSession | null,
  channelId: string,
  playlistId: string
): session is PlaybackSession {
  return (
    !!session &&
    session.playlistId === playlistId &&
    getChannelId(session.channel) === channelId
  );
}

/**
 * The single app-wide playback session. It owns the `VideoPlayer` instance —
 * created with `createVideoPlayer` and released only in `endSession` — so
 * playback outlives the video screen: backing out minimizes the session into
 * the mini player bar instead of stopping it.
 */
export const usePlaybackSessionStore = create<PlaybackSessionState>((set, get) => ({
  session: null,

  startSession: ({ channel, playlistId, contentType, fixture = null, startPosition = 0 }) => {
    get().endSession();

    const player = createVideoPlayer(buildVideoSource(channel));
    player.loop = false;
    player.muted = false;
    player.timeUpdateEventInterval = 0.5;
    useVideoPlayerStore.getState().setPlayer(player);

    set({
      session: {
        player,
        channel,
        playlistId,
        contentType,
        fixture,
        startPosition,
        mode: 'fullscreen',
        screenViewAttached: false,
      },
    });
  },

  minimize: () =>
    set((state) => (state.session ? { session: { ...state.session, mode: 'mini' } } : state)),

  expand: () =>
    set((state) => (state.session ? { session: { ...state.session, mode: 'fullscreen' } } : state)),

  endSession: () => {
    const { session } = get();
    if (!session) return;

    set({ session: null });
    useVideoPlayerStore.getState().setPlayer(null);
    usePlaybackQueueStore.getState().reset();

    const { player } = session;
    try {
      player.pause();
    } catch (error) {
      console.warn('[PlaybackSession] Failed to pause player:', error);
    }
    // Release on the next tick so React can unmount any still-attached
    // VideoView first — releasing an attached player is fragile on Android.
    setTimeout(() => {
      try {
        player.release();
      } catch (error) {
        console.warn('[PlaybackSession] Failed to release player:', error);
      }
    }, 0);
  },

  setScreenViewAttached: (attached) =>
    set((state) =>
      state.session && state.session.screenViewAttached !== attached
        ? { session: { ...state.session, screenViewAttached: attached } }
        : state
    ),
}));
