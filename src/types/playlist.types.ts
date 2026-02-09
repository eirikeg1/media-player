import type { Playlist as IPTVPlaylist } from 'iptv-playlist-parser';

/** Authentication credentials for protected IPTV playlists. */
export interface PlaylistCredentials {
  username: string;
  password: string;
}

/** Represents a single IPTV channel with its metadata. */
export interface Channel {
  name: string;
  url: string;
  tvg: {
    id?: string;
    name?: string;
    logo?: string;
    country?: string;
    language?: string;
    url?: string;
  };
  group: {
    title?: string;
  };
  http?: {
    referrer?: string;
    userAgent?: string;
  };
}

/** Parsed M3U playlist data from iptv-playlist-parser library. */
export type ParsedPlaylist = IPTVPlaylist;

/** Playlist entity with metadata and parsed channel data. */
export interface Playlist {
  id: string;
  name: string;
  url: string;
  credentials?: PlaylistCredentials;
  parsedData?: ParsedPlaylist;
  channelCount?: number;
  createdByUserId?: string;
  createdAt: Date;
  updatedAt: Date;
  lastFetchedAt?: Date;
}

/** Input data for creating a new playlist. */
export interface CreatePlaylistInput {
  name: string;
  url: string;
  credentials?: PlaylistCredentials;
}

/** Input data for updating playlist properties. */
export interface UpdatePlaylistInput {
  name?: string;
  url?: string;
  credentials?: PlaylistCredentials;
}

/** Status states for async playlist operations. */
export enum PlaylistStatus {
  IDLE = 'idle',
  LOADING = 'loading',
  SUCCESS = 'success',
  ERROR = 'error',
}
