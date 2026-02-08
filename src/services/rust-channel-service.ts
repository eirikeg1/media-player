import { Paths } from 'expo-file-system';
import {
  Database,
  type Channel as RustChannel,
  type ChannelFilter,
  type ChannelMetadata,
  type ChannelsWithCount as RustChannelsWithCount,
  type Credentials,
  type PlaylistMetadata,
  type GroupCount,
  type SeriesInfo,
  type SeriesListResult,
} from 'expo-m3u-parser';
import type { Channel, PlaylistCredentials } from '@/types/playlist.types';

// Singleton database instance
let database: Database | null = null;
const DB_NAME = 'channels.db';

/**
 * Get the database file path in the app's document directory
 */
function getDatabasePath(): string {
  return Paths.document.uri + DB_NAME;
}

/**
 * Get or create the Rust database instance
 */
export async function getRustDatabase(): Promise<Database> {
  if (database) {
    return database;
  }

  const dbPath = getDatabasePath();
  console.log('[RustChannelService] Opening database at:', dbPath);
  database = await Database.open(dbPath);
  return database;
}

/**
 * Close the Rust database connection
 */
export async function closeRustDatabase(): Promise<void> {
  if (database) {
    await database.close();
    database = null;
    console.log('[RustChannelService] Database closed');
  }
}

/**
 * Convert Rust Channel to JS Channel format
 */
function rustChannelToJsChannel(rustChannel: RustChannel): Channel {
  return {
    name: rustChannel.title,
    url: rustChannel.url,
    tvg: {
      id: rustChannel.tvgId || undefined,
      name: rustChannel.tvgName || undefined,
      logo: rustChannel.tvgLogo || undefined,
      country: rustChannel.tvgCountry || undefined,
      language: rustChannel.tvgLanguage || undefined,
      url: rustChannel.tvgUrl || undefined,
    },
    group: {
      title: rustChannel.group || undefined,
    },
    http:
      rustChannel.userAgent || rustChannel.referer
        ? {
            userAgent: rustChannel.userAgent || undefined,
            referrer: rustChannel.referer || undefined,
          }
        : undefined,
  };
}

/**
 * Convert JS credentials to Rust credentials format
 */
function toRustCredentials(credentials?: PlaylistCredentials): Credentials | undefined {
  if (!credentials) return undefined;
  return {
    username: credentials.username,
    password: credentials.password,
  };
}

/**
 * Service for managing channel data via Rust backend
 */
export class RustChannelService {
  /**
   * Fetch a playlist from URL and import all channels into the Rust database.
   * This is the main entry point for loading playlists.
   *
   * @param playlistId - Unique ID for the playlist
   * @param name - Display name for the playlist
   * @param url - URL to fetch the playlist from
   * @param credentials - Optional credentials for authenticated playlists
   * @returns Number of channels imported
   */
  static async fetchAndImportPlaylist(
    playlistId: string,
    name: string,
    url: string,
    credentials?: PlaylistCredentials
  ): Promise<number> {
    console.log('[RustChannelService] fetchAndImportPlaylist:', {
      playlistId,
      name,
    });
    // DEBUG: Log full URL before passing to Rust FFI
    console.log('[RustChannelService] Sending URL to Rust (full):', url);

    const db = await getRustDatabase();

    // Create or update playlist metadata
    const now = new Date().toISOString();
    const existingPlaylist = await db.getPlaylist(playlistId);

    if (existingPlaylist) {
      // Update existing playlist
      await db.updatePlaylist(playlistId, {
        name,
        url,
        username: credentials?.username,
        password: credentials?.password,
      });
    } else {
      // Create new playlist
      const metadata: PlaylistMetadata = {
        id: playlistId,
        name,
        url,
        username: credentials?.username,
        password: credentials?.password,
        channelCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      await db.createPlaylist(metadata);
    }

    // Fetch and import channels from URL
    const channelCount = await db.fetchAndImportPlaylist(
      playlistId,
      url,
      toRustCredentials(credentials)
    );

    console.log('[RustChannelService] Imported', channelCount, 'channels');
    return channelCount;
  }

  /**
   * Get channels from the Rust database with optional filtering
   */
  static async getChannels(filter?: ChannelFilter): Promise<Channel[]> {
    const db = await getRustDatabase();
    const rustChannels = await db.getChannels(filter);
    return rustChannels.map(rustChannelToJsChannel);
  }

  /**
   * Get channels for a specific playlist
   */
  static async getChannelsByPlaylistId(playlistId: string): Promise<Channel[]> {
    return this.getChannels({ playlistId });
  }

  /**
   * Get channels with filtering, pagination, and sorting
   */
  static async getChannelsFiltered(
    playlistId: string,
    options?: {
      groups?: string[];
      search?: string;
      contentType?: 'live' | 'movie' | 'series';
      limit?: number;
      offset?: number;
      sortBy?: 'title' | 'group' | 'tvgName';
      sortOrder?: 'asc' | 'desc';
    }
  ): Promise<Channel[]> {
    const filter: ChannelFilter = {
      playlistId,
      ...options,
    };
    return this.getChannels(filter);
  }

  /**
   * Get channels with filtering, pagination, sorting, and total count.
   * Uses a single optimized query with COUNT(*) OVER() to avoid separate count call.
   */
  static async getChannelsFilteredWithCount(
    playlistId: string,
    options?: {
      groups?: string[];
      search?: string;
      contentType?: 'live' | 'movie' | 'series';
      limit?: number;
      offset?: number;
      sortBy?: 'title' | 'group' | 'tvgName';
      sortOrder?: 'asc' | 'desc';
      excludeAdult?: boolean;
    }
  ): Promise<{ channels: Channel[]; totalCount: number }> {
    const db = await getRustDatabase();
    const filter: ChannelFilter = {
      playlistId,
      ...options,
    };
    const result: RustChannelsWithCount = await db.getChannelsWithCount(filter);
    return {
      channels: result.channels.map(rustChannelToJsChannel),
      totalCount: result.totalCount,
    };
  }

  /**
   * Get series list with filtering and pagination (grouped by tvg_name)
   */
  static async getSeriesList(
    playlistId: string,
    options?: {
      groups?: string[];
      search?: string;
      limit?: number;
      offset?: number;
      excludeAdult?: boolean;
    }
  ): Promise<{ series: SeriesInfo[]; totalCount: number }> {
    const db = await getRustDatabase();
    const result: SeriesListResult = await db.getSeriesList({
      playlistId,
      ...options,
    });
    return {
      series: result.series,
      totalCount: result.totalCount,
    };
  }

  /**
   * Get all episodes for a specific series
   */
  static async getSeriesEpisodes(
    playlistId: string,
    seriesName: string
  ): Promise<Channel[]> {
    const db = await getRustDatabase();
    const rustChannels = await db.getSeriesEpisodes(playlistId, seriesName);
    return rustChannels.map(rustChannelToJsChannel);
  }

  /**
   * Get a specific channel by ID
   */
  static async getChannelById(
    playlistId: string,
    channelId: string
  ): Promise<Channel | null> {
    const db = await getRustDatabase();
    const rustChannel = await db.getChannelById(playlistId, channelId);
    return rustChannel ? rustChannelToJsChannel(rustChannel) : null;
  }

  /**
   * Get rich metadata for a channel by its Xtream stream ID
   */
  static async getMetadataByStreamId(
    playlistId: string,
    streamId: number
  ): Promise<ChannelMetadata | null> {
    const db = await getRustDatabase();
    return db.getMetadataByStreamId(playlistId, streamId);
  }

  /**
   * Get rich metadata for a series by its name
   */
  static async getMetadataBySeriesName(
    playlistId: string,
    seriesName: string
  ): Promise<ChannelMetadata | null> {
    const db = await getRustDatabase();
    return db.getMetadataBySeriesName(playlistId, seriesName);
  }

  /**
   * Get all unique groups for a playlist
   */
  static async getGroupsByPlaylist(playlistId: string): Promise<string[]> {
    const db = await getRustDatabase();
    return db.getGroupsByPlaylist(playlistId);
  }

  /**
   * Get groups with channel counts for a playlist
   */
  static async getGroupsWithCountsByPlaylist(
    playlistId: string,
    contentType?: 'live' | 'movie' | 'series',
    excludeAdult?: boolean
  ): Promise<GroupCount[]> {
    const db = await getRustDatabase();
    return db.getGroupsWithCountsByPlaylist(playlistId, contentType, excludeAdult);
  }

  /**
   * Count channels in a playlist
   */
  static async countChannelsByPlaylist(playlistId: string): Promise<number> {
    const db = await getRustDatabase();
    return db.countChannelsByPlaylist(playlistId);
  }

  /**
   * Delete all channels for a playlist
   */
  static async deleteChannelsByPlaylist(playlistId: string): Promise<void> {
    const db = await getRustDatabase();
    await db.deleteChannelsByPlaylist(playlistId);
  }

  /**
   * Delete a playlist and all its channels
   */
  static async deletePlaylist(playlistId: string): Promise<void> {
    const db = await getRustDatabase();
    await db.deletePlaylist(playlistId);
  }

  /**
   * Get playlist metadata from Rust database
   */
  static async getPlaylistMetadata(playlistId: string): Promise<PlaylistMetadata | null> {
    const db = await getRustDatabase();
    return db.getPlaylist(playlistId);
  }

  /**
   * Get all playlists from Rust database
   */
  static async getAllPlaylistMetadata(): Promise<PlaylistMetadata[]> {
    const db = await getRustDatabase();
    return db.getAllPlaylists();
  }
}
