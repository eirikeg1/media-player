import type { Playlist, Channel } from '@/types/playlist.types';
import { executeQuery, executeQuerySingle, executeStatement } from './sqlite-client';
import { RustChannelService } from '@/services/rust-channel-service';

/**
 * Repository interface for playlist data access
 */
export interface IPlaylistRepository {
  getAll(): Promise<Playlist[]>;
  getById(id: string): Promise<Playlist | null>;
  create(playlist: Playlist): Promise<Playlist>;
  update(id: string, updates: Partial<Playlist>): Promise<Playlist>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;

  // Channel operations
  getChannelsByPlaylistId(playlistId: string): Promise<Channel[]>;
  saveChannels(playlistId: string, channels: Channel[]): Promise<void>;
  deleteChannelsByPlaylistId(playlistId: string): Promise<void>;
}

/**
 * Database row types
 */
interface PlaylistRow {
  id: string;
  name: string;
  url: string;
  username: string | null;
  password: string | null;
  channelCount: number | null;
  createdAt: string;
  updatedAt: string;
  lastFetchedAt: string | null;
}

interface ChannelRow {
  id: string;
  playlistId: string;
  name: string;
  url: string;
  tvgId: string | null;
  tvgName: string | null;
  tvgLogo: string | null;
  tvgCountry: string | null;
  tvgLanguage: string | null;
  tvgUrl: string | null;
  groupTitle: string | null;
  httpReferrer: string | null;
  httpUserAgent: string | null;
}

/**
 * SQLite implementation of playlist repository
 */
class SQLitePlaylistRepository implements IPlaylistRepository {
  /**
   * Convert database row to Playlist object
   */
  private rowToPlaylist(row: PlaylistRow, channels?: Channel[]): Playlist {
    const playlist: Playlist = {
      id: row.id,
      name: row.name,
      url: row.url,
      channelCount: row.channelCount || undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      lastFetchedAt: row.lastFetchedAt ? new Date(row.lastFetchedAt) : undefined,
    };

    if (row.username && row.password) {
      playlist.credentials = {
        username: row.username,
        password: row.password,
      };
    }

    if (channels && channels.length > 0) {
      playlist.parsedData = {
        items: channels as any,
        header: {
          attrs: { 'x-tvg-url': '' },
          raw: '',
        },
      };
    }

    return playlist;
  }

  /**
   * Convert database row to Channel object
   */
  private rowToChannel(row: ChannelRow): Channel {
    return {
      name: row.name,
      url: row.url,
      tvg: {
        id: row.tvgId || undefined,
        name: row.tvgName || undefined,
        logo: row.tvgLogo || undefined,
        country: row.tvgCountry || undefined,
        language: row.tvgLanguage || undefined,
        url: row.tvgUrl || undefined,
      },
      group: {
        title: row.groupTitle || undefined,
      },
      http: row.httpReferrer || row.httpUserAgent ? {
        referrer: row.httpReferrer || undefined,
        userAgent: row.httpUserAgent || undefined,
      } : undefined,
    };
  }

  async getAll(): Promise<Playlist[]> {
    console.log('[SQLitePlaylistRepository] getAll called');
    const rows = await executeQuery<PlaylistRow>(
      'SELECT * FROM playlists ORDER BY createdAt DESC'
    );

    // Don't load channels here - they'll be fetched on-demand from Rust DB
    const playlists = rows.map((row) => this.rowToPlaylist(row));

    console.log('[SQLitePlaylistRepository] Found', playlists.length, 'playlists');
    return playlists;
  }

  async getById(id: string): Promise<Playlist | null> {
    console.log('[SQLitePlaylistRepository] getById called:', id);
    const row = await executeQuerySingle<PlaylistRow>(
      'SELECT * FROM playlists WHERE id = ?',
      [id]
    );

    if (!row) {
      console.log('[SQLitePlaylistRepository] Playlist not found');
      return null;
    }

    // Don't load channels here - they'll be fetched on-demand from Rust DB
    console.log('[SQLitePlaylistRepository] Found playlist');
    return this.rowToPlaylist(row);
  }

  async create(playlist: Playlist): Promise<Playlist> {
    console.log('[SQLitePlaylistRepository] create called:', {
      id: playlist.id,
      name: playlist.name,
      channelCount: playlist.channelCount,
    });

    // Only store playlist metadata - channels are stored in Rust database
    await executeStatement(
      `INSERT INTO playlists (id, name, url, username, password, channelCount, createdAt, updatedAt, lastFetchedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        playlist.id,
        playlist.name,
        playlist.url,
        playlist.credentials?.username || null,
        playlist.credentials?.password || null,
        playlist.channelCount || null,
        playlist.createdAt.toISOString(),
        playlist.updatedAt.toISOString(),
        playlist.lastFetchedAt?.toISOString() || null,
      ]
    );

    console.log('[SQLitePlaylistRepository] Playlist created successfully');
    return playlist;
  }

  async update(id: string, updates: Partial<Playlist>): Promise<Playlist> {
    console.log('[SQLitePlaylistRepository] update called:', id);

    const existing = await this.getById(id);
    if (!existing) {
      console.error('[SQLitePlaylistRepository] Playlist not found:', id);
      throw new Error(`Playlist with id ${id} not found`);
    }

    const updated: Playlist = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };

    // Only update playlist metadata - channels are managed by Rust
    await executeStatement(
      `UPDATE playlists
       SET name = ?, url = ?, username = ?, password = ?, channelCount = ?, updatedAt = ?, lastFetchedAt = ?
       WHERE id = ?`,
      [
        updated.name,
        updated.url,
        updated.credentials?.username || null,
        updated.credentials?.password || null,
        updated.channelCount || null,
        updated.updatedAt.toISOString(),
        updated.lastFetchedAt?.toISOString() || null,
        id,
      ]
    );

    console.log('[SQLitePlaylistRepository] Playlist updated successfully');
    return updated;
  }

  async delete(id: string): Promise<void> {
    console.log('[SQLitePlaylistRepository] delete called:', id);

    const result = await executeStatement('DELETE FROM playlists WHERE id = ?', [id]);

    if (result.changes === 0) {
      console.error('[SQLitePlaylistRepository] Playlist not found:', id);
      throw new Error(`Playlist with id ${id} not found`);
    }

    console.log('[SQLitePlaylistRepository] Playlist deleted successfully');
  }

  async clear(): Promise<void> {
    console.log('[SQLitePlaylistRepository] clear called');
    await executeStatement('DELETE FROM playlists');
    await executeStatement('DELETE FROM channels');
    console.log('[SQLitePlaylistRepository] All playlists and channels cleared');
  }

  async getChannelsByPlaylistId(playlistId: string): Promise<Channel[]> {
    // Channels are now stored in Rust database
    console.log('[SQLitePlaylistRepository] getChannelsByPlaylistId - delegating to Rust:', playlistId);
    return RustChannelService.getChannelsByPlaylistId(playlistId);
  }

  async saveChannels(_playlistId: string, _channels: Channel[]): Promise<void> {
    // Channels are now managed by Rust - this is a no-op
    // Channel import happens via RustChannelService.fetchAndImportPlaylist()
    console.log('[SQLitePlaylistRepository] saveChannels - no-op, channels managed by Rust');
  }

  async deleteChannelsByPlaylistId(playlistId: string): Promise<void> {
    // Channels are now stored in Rust database
    console.log('[SQLitePlaylistRepository] deleteChannelsByPlaylistId - delegating to Rust:', playlistId);
    await RustChannelService.deleteChannelsByPlaylist(playlistId);
  }
}

/**
 * Factory function to create a repository instance
 */
export function createPlaylistRepository(): IPlaylistRepository {
  return new SQLitePlaylistRepository();
}

/**
 * Singleton instance of the repository
 */
export const playlistRepository = createPlaylistRepository();
