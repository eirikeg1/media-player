import { useCallback, useEffect, useRef } from 'react';
import {
  CastState,
  MediaHlsSegmentFormat,
  MediaHlsVideoSegmentFormat,
  MediaStreamType,
  useCastState,
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
  const isLoadingMedia = useRef(false);
  const wasCastingRef = useRef(false);
  const isCasting = castState === CastState.CONNECTED;

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
        } catch (error) {
          console.error('[Cast] loadMedia FAILED:', error);
        }
      } finally {
        isLoadingMedia.current = false;
      }
    },
    [client],
  );

  // Unload local player as soon as a cast device is selected (CONNECTING phase)
  // This fully releases the stream before Chromecast tries to connect,
  // avoiding Xtream Codes rejecting the concurrent connection.
  useEffect(() => {
    if (castState === CastState.CONNECTING) {
      const localPlayer = useVideoPlayerStore.getState().player;
      if (localPlayer) {
        localPlayer.replaceAsync(null);
      }
    }
  }, [castState]);

  // Auto-load channel when cast state is fully connected
  useEffect(() => {
    if (client && castState === CastState.CONNECTED) {
      castMedia(channel);
    }
  }, [client, castState, channel, castMedia]);

  // Sync isCasting state with the store and manage local player
  useEffect(() => {
    useVideoPlayerStore.getState().setIsCasting(isCasting);

    if (isCasting) {
      wasCastingRef.current = true;
    } else if (wasCastingRef.current) {
      wasCastingRef.current = false;
      const localPlayer = useVideoPlayerStore.getState().player;
      if (localPlayer) {
        localPlayer.replaceAsync(channel.url);
      }
    }

    return () => {
      if (wasCastingRef.current) {
        useVideoPlayerStore.getState().setIsCasting(false);
      }
    };
  }, [isCasting, channel.url]);

  return { isCasting, castMedia };
}
