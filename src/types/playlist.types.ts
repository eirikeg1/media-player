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
    /**
     * `tvg-shift`: whole hours to add to this channel's EPG times, signed.
     *
     * The guide is stored as the XMLTV source published it; a provider whose
     * feed for a channel is in another zone advertises the offset here instead
     * of correcting the times. Every EPG read takes it and applies it in SQL, so
     * the programmes the app receives are already on the device's clock —
     * nothing downstream shifts anything itself. Absent means unshifted.
     */
    shift?: number;
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
  epgUrl?: string;
  credentials?: PlaylistCredentials;
  parsedData?: ParsedPlaylist;
  channelCount?: number;
  createdByUserId?: string;
  syncInterval?: number;
  epgSyncInterval?: number;
  createdAt: Date;
  updatedAt: Date;
  lastFetchedAt?: Date;
  lastEpgFetchedAt?: Date;
}

/** Input data for creating a new playlist. */
export interface CreatePlaylistInput {
  /**
   * Id to create the playlist under. Generated when omitted; a caller supplies
   * one when it has to follow the import's progress, which is keyed by id and
   * starts before the playlist row exists.
   */
  id?: string;
  name: string;
  url: string;
  epgUrl?: string;
  credentials?: PlaylistCredentials;
  /** Minutes between channel re-imports; `0` is off. Defaults to the shipped default. */
  syncInterval?: number;
  /** Minutes between guide downloads; `0` is off. Defaults to the shipped default. */
  epgSyncInterval?: number;
}

/** Input data for updating playlist properties. */
export interface UpdatePlaylistInput {
  name?: string;
  url?: string;
  epgUrl?: string;
  syncInterval?: number | null;
  epgSyncInterval?: number | null;
  credentials?: PlaylistCredentials;
}

/** Status states for async playlist operations. */
export enum PlaylistStatus {
  IDLE = 'idle',
  LOADING = 'loading',
  SUCCESS = 'success',
  ERROR = 'error',
}
