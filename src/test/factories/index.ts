/**
 * Typed mock-data factories. Every factory returns a complete, realistic
 * object and accepts a partial override, so tests state only what they care
 * about. A shared counter keeps generated values unique within a test file.
 *
 * Only factories with actual consumers live here — add new ones when a test
 * needs them rather than speculatively.
 */
import type { Channel as RustChannel, PlaylistMetadata } from 'expo-m3u-parser';
import type { Channel, Playlist, PlaylistCredentials } from '@/types/playlist.types';

let counter = 0;
function nextId(): number {
  return ++counter;
}

/** Fixed reference time so factory output is deterministic and comparable. */
export const FACTORY_NOW = new Date('2026-06-12T12:00:00.000Z');

// ── IPTV channels ──

export function makeChannel(overrides: Partial<Channel> = {}): Channel {
  const id = nextId();
  return {
    name: `Channel ${id}`,
    url: `http://stream.example.com/live/channel-${id}.m3u8`,
    tvg: {
      id: `channel-${id}.example`,
      name: `Channel ${id}`,
      logo: `https://logos.example.com/channel-${id}.png`,
      country: 'NO',
      language: 'Norwegian',
      ...overrides.tvg,
    },
    group: { title: 'General', ...overrides.group },
    ...overrides,
  };
}

export function makeRustChannel(overrides: Partial<RustChannel> = {}): RustChannel {
  const id = nextId();
  const title = overrides.title ?? `Channel ${id}`;
  const url = overrides.url ?? `http://stream.example.com/live/channel-${id}.m3u8`;
  const tvgId = 'tvgId' in overrides ? overrides.tvgId : `channel-${id}.example`;
  return {
    title,
    url,
    group: 'General',
    tvgId,
    tvgName: title,
    tvgLogo: `https://logos.example.com/channel-${id}.png`,
    duration: -1,
    contentType: 'live',
    isAdult: false,
    channelId: tvgId?.trim() ? tvgId.trim() : `${title}|${url}`,
    ...overrides,
  };
}

// ── Playlists ──

export function makePlaylistCredentials(
  overrides: Partial<PlaylistCredentials> = {},
): PlaylistCredentials {
  return { username: 'test-user', password: 'test-pass', ...overrides };
}

export function makePlaylist(overrides: Partial<Playlist> = {}): Playlist {
  const id = nextId();
  return {
    id: `playlist-${id}`,
    name: `Playlist ${id}`,
    url: `https://iptv.example.com/playlist-${id}.m3u`,
    channelCount: 0,
    createdAt: FACTORY_NOW,
    updatedAt: FACTORY_NOW,
    ...overrides,
  };
}

export function makePlaylistMetadata(
  overrides: Partial<PlaylistMetadata> = {},
): PlaylistMetadata {
  const id = nextId();
  return {
    id: `playlist-${id}`,
    name: `Playlist ${id}`,
    url: `https://iptv.example.com/playlist-${id}.m3u`,
    channelCount: 0,
    createdAt: FACTORY_NOW.toISOString(),
    updatedAt: FACTORY_NOW.toISOString(),
    ...overrides,
  };
}
