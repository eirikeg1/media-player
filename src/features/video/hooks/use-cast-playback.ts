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
import { useVideoPlayerStore } from '@/stores/video/player-store';
import type { Channel } from '@/types/playlist.types';

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
}

interface XtreamUrlInfo {
  serverUrl: string; // http://host:port
  username: string;
  password: string;
  streamId: string;
}

/** Parse an Xtream Codes URL (http://host:port/username/password/stream_id) into its components. */
function parseXtreamUrl(url: string): XtreamUrlInfo | null {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length === 3 && !segments[2].includes('.')) {
      return {
        serverUrl: `${parsed.protocol}//${parsed.host}`,
        username: segments[0],
        password: segments[1],
        streamId: segments[2],
      };
    }
  } catch {
    // Not a valid URL
  }
  return null;
}

/** Delay (ms) for Xtream servers to release the connection slot after player unload. */
const CONNECTION_RELEASE_DELAY_MS = 2000;

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
      return `${info.serverUrl}/live/${info.username}/${info.password}/${info.streamId}.m3u8`;
    }
  } catch (error) {
    console.warn('[Cast] Xtream API call failed:', error);
  } finally {
    clearTimeout(timeout);
  }
  return null;
}

export function useCastPlayback({ channel }: UseCastPlaybackProps) {
  const client = useRemoteMediaClient();
  const castState = useCastState();
  const mediaStatus = useMediaStatus();
  const isLoadingMedia = useRef(false);
  const didUnloadForCastRef = useRef(false);
  const castChannelUrlRef = useRef<string | null>(null);

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
    async (ch: Channel) => {
      if (!client) return;
      if (isLoadingMedia.current) return;

      isLoadingMedia.current = true;

      try {
        // 1. Try to parse as Xtream URL and query API for HLS support.
        //    This happens BEFORE player unload — the API call is a JSON request,
        //    not a stream, so it doesn't consume a connection slot.
        let castUrl = ch.url;
        let contentType = getContentType(ch.url);
        const xtreamInfo = parseXtreamUrl(ch.url);

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
        castUrl = await resolveRedirects(castUrl);

        // 3. Give the server time to release the connection slot
        //    (freed by the CONNECTING effect).
        await new Promise(resolve => setTimeout(resolve, CONNECTION_RELEASE_DELAY_MS));

        // 4. Load media on Chromecast.
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
              streamType: MediaStreamType.LIVE,
            },
          });
          castChannelUrlRef.current = castUrl;
        } catch (error) {
          castChannelUrlRef.current = null;
          console.error('[Cast] loadMedia FAILED:', error);
          Alert.alert(
            'Cast Failed',
            'Failed to load media on the TV. Please try again.',
            [{ text: 'OK' }],
          );
        }
      } finally {
        isLoadingMedia.current = false;
      }
    },
    [client],
  );

  // Manage local player lifecycle across all cast state transitions.
  // Consolidates CONNECTING unload, CONNECTED load, and recovery into one effect
  // so the player is always restored — even if the connection fails before CONNECTED.
  useEffect(() => {
    const connected = castState === CastState.CONNECTED;
    useVideoPlayerStore.getState().setIsCasting(connected);

    if (castState === CastState.CONNECTING) {
      const localPlayer = useVideoPlayerStore.getState().player;
      if (localPlayer) {
        localPlayer.replaceAsync(null);
      }
      didUnloadForCastRef.current = true;
    } else if (connected) {
      didUnloadForCastRef.current = true;
      // Unload local player — handles screen remount while already casting,
      // where useVideoPlayer(url) creates a fresh player that would compete
      // for the server stream slot.
      const localPlayer = useVideoPlayerStore.getState().player;
      if (localPlayer) {
        localPlayer.replaceAsync(null);
      }
    } else if (didUnloadForCastRef.current) {
      // Cast ended or connection failed — restore local player
      castChannelUrlRef.current = null;
      didUnloadForCastRef.current = false;
      const localPlayer = useVideoPlayerStore.getState().player;
      if (localPlayer) {
        localPlayer.replaceAsync(channel.url);
      }
    }

  }, [castState, channel.url]);

  // Auto-load channel when cast state is fully connected
  useEffect(() => {
    if (client && castState === CastState.CONNECTED && !castChannelUrlRef.current) {
      castMedia(channel);
    }
  }, [client, castState, channel, castMedia]);

  return { castMedia, toggleCastPlayPause, isCastPlaying };
}
