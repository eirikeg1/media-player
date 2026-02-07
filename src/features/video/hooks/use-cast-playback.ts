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

    console.log('[Cast] Xtream API allowed_output_formats:', formats);

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

  console.log('[Cast] Hook render — client:', !!client, 'castState:', castState, 'isCasting:', isCasting);

  const castMedia = useCallback(
    async (ch: Channel) => {
      if (!client) {
        console.log('[Cast] castMedia called but no client available');
        return;
      }

      if (isLoadingMedia.current) {
        console.log('[Cast] castMedia called but already loading — skipping');
        return;
      }

      isLoadingMedia.current = true;

      console.log('[Cast] Channel URL:', ch.url);

      // 1. Try to parse as Xtream URL and query API for HLS support.
      //    This happens BEFORE player unload — the API call is a JSON request,
      //    not a stream, so it doesn't consume a connection slot.
      let castUrl = ch.url;
      let contentType = getContentType(ch.url);
      const xtreamInfo = parseXtreamUrl(ch.url);

      if (xtreamInfo) {
        console.log('[Cast] Detected Xtream URL — querying API for HLS support');
        const hlsUrl = await queryXtreamHlsUrl(xtreamInfo);
        if (hlsUrl) {
          console.log('[Cast] Xtream API confirms HLS — using:', hlsUrl);
          castUrl = hlsUrl;
          contentType = 'application/x-mpegurl';
        } else {
          console.log('[Cast] Xtream API: no HLS support — falling back to raw URL');
        }
      }

      // 2. Unload local player to free the connection slot.
      const localPlayer = useVideoPlayerStore.getState().player;
      if (localPlayer) {
        console.log('[Cast] Unloading local player before casting');
        await localPlayer.replaceAsync(null);
      }

      // 3. Resolve redirects — Chromecast default receiver may not follow 302s.
      //    Done after player unload but before the wait: redirect endpoints return
      //    302 immediately (no stream opened, no connection slot consumed).
      castUrl = await resolveRedirects(castUrl);
      console.log('[Cast] Resolved URL:', castUrl);

      // 4. Give the server time to release the connection slot.
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 5. Load media on Chromecast.
      console.log('[Cast] Loading media — url:', castUrl, 'contentType:', contentType);

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
        console.log('[Cast] loadMedia succeeded');
      } catch (error) {
        console.error('[Cast] loadMedia FAILED:', error);
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
        console.log('[Cast] Unloading local player — cast device selected');
        localPlayer.replaceAsync(null);
      }
    }
  }, [castState]);

  // Auto-load channel when cast state is fully connected
  useEffect(() => {
    console.log('[Cast] Session effect — client:', !!client, 'castState:', castState);
    if (client && castState === CastState.CONNECTED) {
      console.log('[Cast] Cast session connected — loading channel:', channel.name);
      castMedia(channel);
    }
  }, [client, castState, channel, castMedia]);

  // Media status listener for Chromecast-side feedback
  useEffect(() => {
    if (!client) return;
    const sub = client.onMediaStatusUpdated((status) => {
      console.log('[Cast] Media status:', JSON.stringify(status, null, 2));
    });
    return () => sub.remove();
  }, [client]);

  // Sync isCasting state with the store and manage local player
  useEffect(() => {
    console.log('[Cast] isCasting changed:', isCasting);
    useVideoPlayerStore.getState().setIsCasting(isCasting);

    if (isCasting) {
      wasCastingRef.current = true;
    } else if (wasCastingRef.current) {
      wasCastingRef.current = false;
      const localPlayer = useVideoPlayerStore.getState().player;
      if (localPlayer) {
        console.log('[Cast] Reloading local player after cast disconnect');
        localPlayer.replaceAsync(channel.url);
      }
    }

    return () => {
      useVideoPlayerStore.getState().setIsCasting(false);
    };
  }, [isCasting, channel.url]);

  return { isCasting, castMedia };
}
