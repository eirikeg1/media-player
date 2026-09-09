import type { Playlist } from '@/types/playlist.types';
import { executeQuery, executeQuerySingle, executeStatement } from './sqlite-client';

/**
 * Repository interface for playlist data access
 */
export interface IPlaylistRepository {
  getAll(): Promise<Playlist[]>;
  getVisiblePlaylists(userId: string, sharingEnabled: boolean): Promise<Playlist[]>;
  getById(id: string): Promise<Playlist | null>;
  create(playlist: Playlist): Promise<Playlist>;
  update(id: string, updates: Partial<Playlist>): Promise<Playlist>;
  delete(id: string): Promise<void>;
}

/**
 * Database row types
 */
interface PlaylistRow {
  id: string;
  name: string;
  url: string;
  epgUrl: string | null;
  username: string | null;
  password: string | null;
  channelCount: number | null;
  syncInterval: number | null;
  epgSyncInterval: number | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  lastFetchedAt: string | null;
  lastEpgFetchedAt: string | null;
}

/**
 * SQLite implementation of playlist repository
 */
class SQLitePlaylistRepository implements IPlaylistRepository {
  /**
   * Convert database row to Playlist object
   */
  private rowToPlaylist(row: PlaylistRow): Playlist {
    const playlist: Playlist = {
      id: row.id,
      name: row.name,
      url: row.url,
      epgUrl: row.epgUrl || undefined,
      channelCount: row.channelCount || undefined,
      syncInterval: row.syncInterval ?? undefined,
      epgSyncInterval: row.epgSyncInterval ?? undefined,
      createdByUserId: row.createdByUserId || undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      lastFetchedAt: row.lastFetchedAt ? new Date(row.lastFetchedAt) : undefined,
      lastEpgFetchedAt: row.lastEpgFetchedAt ? new Date(row.lastEpgFetchedAt) : undefined,
    };

    if (row.username && row.password) {
      playlist.credentials = {
        username: row.username,
        password: row.password,
      };
    }

    return playlist;
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

  async getVisiblePlaylists(userId: string, sharingEnabled: boolean): Promise<Playlist[]> {
    console.log('[SQLitePlaylistRepository] getVisiblePlaylists called:', { userId, sharingEnabled });
    const rows = await executeQuery<PlaylistRow>(
      `SELECT DISTINCT p.* FROM playlists p
       WHERE p.createdByUserId = ?
          OR p.createdByUserId IS NULL
          OR (
            ? = 1
            AND EXISTS (
              SELECT 1 FROM user_settings us
              WHERE us.userId = p.createdByUserId AND us.playlistSharingEnabled = 1
            )
          )
       ORDER BY p.createdAt DESC`,
      [userId, sharingEnabled ? 1 : 0]
    );

    const playlists = rows.map((row) => this.rowToPlaylist(row));
    console.log('[SQLitePlaylistRepository] Found', playlists.length, 'visible playlists');
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
      `INSERT INTO playlists (id, name, url, epgUrl, username, password, channelCount, syncInterval, epgSyncInterval, createdByUserId, createdAt, updatedAt, lastFetchedAt, lastEpgFetchedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        playlist.id,
        playlist.name,
        playlist.url,
        playlist.epgUrl || null,
        playlist.credentials?.username || null,
        playlist.credentials?.password || null,
        playlist.channelCount || null,
        playlist.syncInterval ?? null,
        playlist.epgSyncInterval ?? null,
        playlist.createdByUserId || null,
        playlist.createdAt.toISOString(),
        playlist.updatedAt.toISOString(),
        playlist.lastFetchedAt?.toISOString() || null,
        playlist.lastEpgFetchedAt?.toISOString() || null,
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
       SET name = ?, url = ?, epgUrl = ?, username = ?, password = ?, channelCount = ?, syncInterval = ?, epgSyncInterval = ?, updatedAt = ?, lastFetchedAt = ?, lastEpgFetchedAt = ?
       WHERE id = ?`,
      [
        updated.name,
        updated.url,
        updated.epgUrl || null,
        updated.credentials?.username || null,
        updated.credentials?.password || null,
        updated.channelCount || null,
        updated.syncInterval ?? null,
        updated.epgSyncInterval ?? null,
        updated.updatedAt.toISOString(),
        updated.lastFetchedAt?.toISOString() || null,
        updated.lastEpgFetchedAt?.toISOString() || null,
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
