import { useCallback, useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import {
  CastState,
  MediaHlsSegmentFormat,
  MediaHlsVideoSegmentFormat,
  MediaPlayerState,
  MediaStreamType,
  useCastState,
  useMediaStatus,
  useRemoteMediaClient,
} from 'react-native-google-cast';

import { resolveRedirects } from 'expo-m3u-parser';
import { getChannelId } from '@/lib/channel-utils';
import { buildVideoSource, usePlaybackSessionStore } from '@/stores/video/playback-session-store';
import { useVideoPlayerStore } from '@/stores/video/player-store';
import type { Channel } from '@/types/playlist.types';
import { CONNECTION_RELEASE_DELAY_MS } from '../constants';
import { parseXtreamUrl, type XtreamUrlInfo } from '../utils/xtream-url';

/**
 * How long to wait for the redirect probe before casting the URL as it is. It
 * is a courtesy for receivers that don't follow 302s, not a requirement — an
 * unreachable or slow endpoint must not strand the cast in "loading" forever.
 */
const REDIRECT_TIMEOUT_MS = 5000;

/** Resolve redirects, falling back to `url` if that takes too long or fails. */
async function resolveRedirectsWithTimeout(url: string): Promise<string> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      resolveRedirects(url),
      new Promise<string>((resolve) => {
        timeout = setTimeout(() => resolve(url), REDIRECT_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    console.warn('[Cast] Redirect resolution failed:', error);
    return url;
  } finally {
    clearTimeout(timeout);
  }
}

/** Map a URL to its MIME content type based on extension. */
function getContentType(url: string): string {
  const lower = url.toLowerCase();
  if (lower.endsWith('.m3u8')) return 'application/x-mpegurl';
  if (lower.endsWith('.mpd')) return 'application/dash+xml';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.ts')) return 'video/mp2t';
  return 'video/mp2t'; // Raw Xtream URLs serve MPEG-TS
}

interface UseCastPlaybackProps {
  channel: Channel;
  /** What to cast; defaults to the channel's own URL (a catch-up window differs). */
  streamUrl?: string;
  /**
   * Whether `streamUrl` is a catch-up window. A window is a finite recording,
   * so the receiver buffers and seeks it instead of treating it as live.
   */
  isCatchup: boolean;
}

/** Query the Xtream API to check HLS support, return the HLS URL if available. */
async function queryXtreamHlsUrl(info: XtreamUrlInfo): Promise<string | null> {
  const apiUrl = `${info.serverUrl}/player_api.php?username=${encodeURIComponent(info.username)}&password=${encodeURIComponent(info.password)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(apiUrl, { signal: controller.signal });
    const data = await response.json();
    // Different Xtream implementations use different field names
    const formats: string[] =
      data?.user_info?.allowed_output_formats ??
      data?.user_info?.allowed_output_extensions ??
      [];

    if (formats.includes('m3u8')) {
      return info.hlsUrl;
    }
  } catch (error) {
    console.warn('[Cast] Xtream API call failed:', error);
  } finally {
    clearTimeout(timeout);
  }
  return null;
}

export function useCastPlayback({ channel, streamUrl = channel.url, isCatchup }: UseCastPlaybackProps) {
  const client = useRemoteMediaClient();
  const castState = useCastState();
  const mediaStatus = useMediaStatus();
  const didUnloadForCastRef = useRef(false);
  // What the receiver is currently loaded with. Keyed by channel *and* URL, so
  // switching the same channel between live and a catch-up window re-loads it.
  const castLoadedTargetRef = useRef<string | null>(null);
  const loadSeqRef = useRef(0);
  const castTarget = `${getChannelId(channel)}|${streamUrl}`;

  const isCastPlaying =
    mediaStatus?.playerState === MediaPlayerState.PLAYING ||
    mediaStatus?.playerState === MediaPlayerState.BUFFERING;

  const toggleCastPlayPause = useCallback(async () => {
    if (!client) return;
    try {
      if (isCastPlaying) {
        await client.pause();
      } else {
        await client.play();
      }
    } catch (error) {
      console.warn('[Cast] play/pause failed:', error);
    }
  }, [client, isCastPlaying]);

  const castMedia = useCallback(
    async (ch: Channel, url: string) => {
      if (!client) return;

      // Claim this target optimistically so concurrent auto-load effects don't re-fire,
      // and bump the sequence so earlier in-flight loads abandon before calling loadMedia.
      const mySeq = ++loadSeqRef.current;
      castLoadedTargetRef.current = `${getChannelId(ch)}|${url}`;
      // The claim is a lie until loadMedia is actually reached; anything that
      // returns early below has to take it back, or the auto-load effect will
      // never try this target again and the receiver sits on a blank screen.
      let reachedLoadMedia = false;

      try {
        // 1. Try to parse as Xtream URL and query API for HLS support.
        //    This happens BEFORE player unload — the API call is a JSON request,
        //    not a stream, so it doesn't consume a connection slot.
        let castUrl = url;
        let contentType = getContentType(url);
        const xtreamInfo = parseXtreamUrl(url);

        if (xtreamInfo) {
          const hlsUrl = await queryXtreamHlsUrl(xtreamInfo);
          if (hlsUrl) {
            castUrl = hlsUrl;
            contentType = 'application/x-mpegurl';
          }
        }

        // 2. Resolve redirects — Chromecast default receiver may not follow 302s.
        //    Redirect endpoints return 302 immediately (no stream opened,
        //    no connection slot consumed).
        castUrl = await resolveRedirectsWithTimeout(castUrl);

        // 3. Give the server time to release the connection slot
        //    (freed by the CONNECTING effect).
        await new Promise(resolve => setTimeout(resolve, CONNECTION_RELEASE_DELAY_MS));

        // Abandon if a newer castMedia call has superseded us.
        if (mySeq !== loadSeqRef.current) return;

        // 4. Load media on Chromecast.
        reachedLoadMedia = true;
        try {
          await client.loadMedia({
            autoplay: true,
            mediaInfo: {
              contentUrl: castUrl,
              contentType,
              ...(contentType === 'application/x-mpegurl' && {
                hlsSegmentFormat: MediaHlsSegmentFormat.TS,
                hlsVideoSegmentFormat: MediaHlsVideoSegmentFormat.MPEG2_TS,
              }),
              metadata: {
                type: 'generic',
                title: ch.name,
                images: ch.tvg.logo ? [{ url: ch.tvg.logo }] : undefined,
              },
              streamType: isCatchup ? MediaStreamType.BUFFERED : MediaStreamType.LIVE,
            },
          });
        } catch (error) {
          // Only clear the identity if we're still the latest attempt — a stale failure
          // must not wipe a newer successful load's claim.
          if (mySeq === loadSeqRef.current) castLoadedTargetRef.current = null;
          console.error('[Cast] loadMedia FAILED:', error);
          Alert.alert(
            'Cast Failed',
            'Failed to load media on the TV. Please try again.',
            [{ text: 'OK' }],
          );
        }
      } catch (error) {
        console.warn('[Cast] castMedia setup failed:', error);
      } finally {
        // Only the latest attempt may release the claim — a stale one must not
        // wipe a newer successful load's.
        if (!reachedLoadMedia && mySeq === loadSeqRef.current) {
          castLoadedTargetRef.current = null;
        }
      }
    },
    [client, isCatchup],
  );

  // Manage local player lifecycle across all cast state transitions.
  // Consolidates CONNECTING unload, CONNECTED load, and recovery into one effect
  // so the player is always restored — even if the connection fails before CONNECTED.
  useEffect(() => {
    const connected = castState === CastState.CONNECTED;
    useVideoPlayerStore.getState().setIsCasting(connected);
    // The playback session owns the local player handle — reading it here (and
    // not a mirrored copy) is what guarantees it is actually unloaded before
    // the receiver claims the panel's only connection slot.
    const session = usePlaybackSessionStore.getState().session;
    if (!session) return;
    const localPlayer = session.player;

    const unload = () => {
      didUnloadForCastRef.current = true;
      localPlayer
        .replaceAsync(null)
        .catch((error) => console.warn('[Cast] Failed to unload local player:', error));
    };

    if (castState === CastState.CONNECTING) {
      unload();
    } else if (connected) {
      // Unload local player — handles screen remount while already casting,
      // where a fresh session player would compete for the server stream slot.
      unload();
    } else if (didUnloadForCastRef.current) {
      // Cast ended or connection failed — restore local playback. Through
      // buildVideoSource, or the channel's HTTP headers are dropped and a
      // header-gated stream comes back as an IOException.
      castLoadedTargetRef.current = null;
      didUnloadForCastRef.current = false;
      localPlayer
        .replaceAsync(buildVideoSource(session.channel, session.streamUrl))
        .catch((error) => console.warn('[Cast] Failed to restore local player:', error));
    }
  }, [castState, streamUrl]);

  // Auto-load the stream when cast state is fully connected, or when what the
  // component is bound to changes while already casting. Identity comparison
  // ensures the receiver always plays that.
  useEffect(() => {
    if (client && castState === CastState.CONNECTED && castTarget !== castLoadedTargetRef.current) {
      castMedia(channel, streamUrl);
    }
  }, [client, castState, channel, streamUrl, castTarget, castMedia]);

  // Reload the current stream on the receiver, which reconnects it at the
  // live edge (the cast counterpart of the local player's resyncToLive).
  const resyncCastToLive = useCallback(
    () => castMedia(channel, streamUrl),
    [castMedia, channel, streamUrl]
  );

  const seekCast = useCallback(
    async (position: number) => {
      if (!client) return;
      try {
        await client.seek({ position });
      } catch (error) {
        console.warn('[Cast] seek failed:', error);
      }
    },
    [client]
  );

  // The receiver's own timeline, driving the seek bar while casting. A live
  // stream reports no duration, so the bar stays hidden for it.
  const castPosition = mediaStatus?.streamPosition ?? 0;
  const castDuration = mediaStatus?.mediaInfo?.streamDuration ?? 0;

  return {
    castMedia,
    toggleCastPlayPause,
    isCastPlaying,
    resyncCastToLive,
    castPosition,
    castDuration,
    seekCast,
  };
}
