import { RustChannelService } from '@/services/rust-channel-service';
import type { Channel } from '@/types/playlist.types';

/**
 * Turn a channel the guide has into one that can actually be played.
 *
 * Guide rows and search results can name a channel that pagination has never
 * loaded, which `useEpgSearch` represents with a url-less placeholder. Playback
 * can do nothing with an empty url, so the real row is fetched at press time —
 * both from the guide's channel column and from a programme's "Watch Channel".
 *
 * @returns The playable channel, or `null` when this playlist has no such
 *   channel or the lookup failed — neither of which leaves anything to open.
 */
export async function resolvePlayableChannel(
  playlistId: string | null | undefined,
  channel: Channel
): Promise<Channel | null> {
  if (channel.url) return channel;

  const channelId = channel.tvg?.id;
  if (!playlistId || !channelId) return null;

  try {
    const resolved = await RustChannelService.getChannelById(playlistId, channelId);
    if (!resolved) {
      console.warn(`[resolvePlayableChannel] Channel ${channelId} is not in this playlist`);
      return null;
    }
    return resolved;
  } catch (err) {
    console.warn('[resolvePlayableChannel] Failed to resolve channel:', err);
    return null;
  }
}
