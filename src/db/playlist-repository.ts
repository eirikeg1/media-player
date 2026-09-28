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
 * Parse a stored timestamp, falling back to the epoch.
 *
 * An unparseable value used to become an `Invalid Date`, whose NaN timestamp
 * silently failed every "is it time to sync?" comparison, so the playlist never
 * synced again. The epoch reads as "infinitely stale" instead, which triggers a
 * sync that rewrites the bad value.
 */
function parseTimestamp(value: string, column: string, playlistId: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    console.warn(
      `[SQLitePlaylistRepository] Invalid ${column} on playlist ${playlistId}: ${value}`,
    );
    return new Date(0);
  }
  return parsed;
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
      createdAt: parseTimestamp(row.createdAt, 'createdAt', row.id),
      updatedAt: parseTimestamp(row.updatedAt, 'updatedAt', row.id),
      lastFetchedAt: row.lastFetchedAt
        ? parseTimestamp(row.lastFetchedAt, 'lastFetchedAt', row.id)
        : undefined,
      lastEpgFetchedAt: row.lastEpgFetchedAt
        ? parseTimestamp(row.lastEpgFetchedAt, 'lastEpgFetchedAt', row.id)
        : undefined,
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

    // Only the patched columns are written: a full-row write would resurrect the
    // values read above, undoing whatever another writer changed in between (a
    // background sync recording channelCount while the EPG job records
    // lastEpgFetchedAt, for instance).
    const assignments = ['updatedAt = ?'];
    const params: (string | number | null)[] = [new Date().toISOString()];
    const assign = (column: string, value: string | number | null) => {
      assignments.push(`${column} = ?`);
      params.push(value);
    };

    // Required columns are only touched when the patch carries a real value;
    // for the nullable ones a present key with `undefined` clears the column.
    if (updates.name !== undefined) assign('name', updates.name);
    if (updates.url !== undefined) assign('url', updates.url);
    if ('epgUrl' in updates) assign('epgUrl', updates.epgUrl ?? null);
    if ('credentials' in updates) {
      assign('username', updates.credentials?.username || null);
      assign('password', updates.credentials?.password || null);
    }
    if ('channelCount' in updates) assign('channelCount', updates.channelCount ?? null);
    if ('syncInterval' in updates) assign('syncInterval', updates.syncInterval ?? null);
    if ('epgSyncInterval' in updates) assign('epgSyncInterval', updates.epgSyncInterval ?? null);
    if ('lastFetchedAt' in updates) {
      assign('lastFetchedAt', updates.lastFetchedAt?.toISOString() ?? null);
    }
    if ('lastEpgFetchedAt' in updates) {
      assign('lastEpgFetchedAt', updates.lastEpgFetchedAt?.toISOString() ?? null);
    }

    await executeStatement(
      `UPDATE playlists SET ${assignments.join(', ')} WHERE id = ?`,
      [...params, id]
    );

    // Re-read rather than returning the patched snapshot: the row may also carry
    // another writer's change, and the caller puts this straight into the store.
    const written = await this.getById(id);
    if (!written) {
      throw new Error(`Playlist with id ${id} disappeared while being updated`);
    }

    console.log('[SQLitePlaylistRepository] Playlist updated successfully');
    return written;
  }

  /**
   * Delete a playlist. Idempotent: a row that is already gone is the state the
   * caller asked for, so a repeated (or racing) delete is not an error.
   */
  async delete(id: string): Promise<void> {
    console.log('[SQLitePlaylistRepository] delete called:', id);

    const result = await executeStatement('DELETE FROM playlists WHERE id = ?', [id]);

    console.log(
      result.changes === 0
        ? '[SQLitePlaylistRepository] Playlist was already deleted'
        : '[SQLitePlaylistRepository] Playlist deleted successfully'
    );
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
