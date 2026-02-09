import { getChannelId } from '@/lib/channel-utils';
import type {
    CreateUserInput,
    UpdateUserInput,
    User,
    UserPlaybackPosition,
    UserSettings,
    UserWatchHistory
} from '@/types/user.types';
import { DEFAULT_USER_SETTINGS } from '@/types/user.types';
import { randomUUID } from 'expo-crypto';
import { executeQuery, executeQuerySingle, executeStatement, executeTransaction } from './sqlite-client';

/**
 * Repository interface for user data access
 */
export interface IUserRepository {
  // User CRUD operations
  getAllUsers(): Promise<User[]>;
  getUserById(id: string): Promise<User | null>;
  createUser(input: CreateUserInput): Promise<User>;
  updateUser(id: string, updates: UpdateUserInput): Promise<User>;
  deleteUser(id: string): Promise<void>;
  updateLastActive(id: string): Promise<void>;

  // User settings operations
  getUserSettings(userId: string): Promise<UserSettings | null>;
  updateUserSettings(userId: string, settings: Partial<UserSettings>): Promise<UserSettings>;

  // Favorite channels operations
  getFavoriteChannels(userId: string): Promise<string[]>;
  addFavoriteChannel(userId: string, channelId: string): Promise<void>;
  removeFavoriteChannel(userId: string, channelId: string): Promise<void>;
  isFavoriteChannel(userId: string, channelId: string): Promise<boolean>;

  // Hidden channels operations
  getHiddenChannels(userId: string): Promise<string[]>;
  hideChannel(userId: string, channelId: string): Promise<void>;
  unhideChannel(userId: string, channelId: string): Promise<void>;
  isChannelHidden(userId: string, channelId: string): Promise<boolean>;

  // Favorite groups operations
  getFavoriteGroups(userId: string): Promise<string[]>;
  addFavoriteGroup(userId: string, groupName: string): Promise<void>;
  removeFavoriteGroup(userId: string, groupName: string): Promise<void>;
  isFavoriteGroup(userId: string, groupName: string): Promise<boolean>;

  // Channel ordering operations
  getChannelOrder(userId: string): Promise<Map<string, number>>;
  setChannelOrder(userId: string, channelId: string, order: number): Promise<void>;
  clearChannelOrder(userId: string): Promise<void>;

  // Watch history operations
  addWatchHistory(userId: string, channelId: string, duration: number): Promise<void>;
  getWatchHistory(userId: string, limit?: number): Promise<UserWatchHistory[]>;
  clearWatchHistory(userId: string): Promise<void>;

  // Playback position operations
  savePlaybackPosition(userId: string, channelId: string, position: number, totalDuration: number): Promise<void>;
  getPlaybackPosition(userId: string, channelId: string): Promise<UserPlaybackPosition | null>;
  clearPlaybackPosition(userId: string, channelId: string): Promise<void>;

  // Migration helper
  migrateFavoritesToNewFormat(userId: string, channels: { name: string; url: string; tvg?: { id?: string } }[]): Promise<void>;
}

/**
 * Database row types
 */
interface UserRow {
  id: string;
  username: string;
  avatarUrl: string | null;
  pin: string | null;
  createdAt: string;
  updatedAt: string;
  lastActiveAt: string | null;
}

interface UserSettingsRow {
  userId: string;
  theme: string;
  language: string;
  defaultQuality: string;
  defaultSubtitles: string;
  activePlaylistId: string | null;
  channelSortBy: string;
  parentalControlEnabled: number;
  parentalControlPin: string | null;
  showHomeTab: number;
  showLiveTab: number;
  showVideosTab: number;
}

interface UserFavoriteChannelRow {
  id: string;
  userId: string;
  channelId: string;
  addedAt: string;
}

interface UserHiddenChannelRow {
  id: string;
  userId: string;
  channelId: string;
  hiddenAt: string;
}

interface UserFavoriteGroupRow {
  id: string;
  userId: string;
  groupName: string;
  addedAt: string;
}

interface UserChannelOrderRow {
  id: string;
  userId: string;
  channelId: string;
  sortOrder: number;
}

interface UserWatchHistoryRow {
  id: string;
  userId: string;
  channelId: string;
  watchedAt: string;
  duration: number;
}

interface UserPlaybackPositionRow {
  id: string;
  userId: string;
  channelId: string;
  position: number;
  totalDuration: number;
  updatedAt: string;
}

/**
 * SQLite implementation of user repository
 */
class SQLiteUserRepository implements IUserRepository {
  /**
   * Convert database row to User object
   */
  private rowToUser(row: UserRow, settings?: UserSettings): User {
    return {
      id: row.id,
      username: row.username,
      avatarUrl: row.avatarUrl || undefined,
      pin: row.pin || undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      lastActiveAt: row.lastActiveAt ? new Date(row.lastActiveAt) : undefined,
      settings,
    };
  }

  /**
   * Convert database row to UserSettings object
   */
  private rowToUserSettings(row: UserSettingsRow): UserSettings {
    return {
      userId: row.userId,
      theme: row.theme as any,
      language: row.language,
      defaultQuality: row.defaultQuality as any,
      defaultSubtitles: row.defaultSubtitles as any,
      activePlaylistId: row.activePlaylistId || undefined,
      channelSortBy: row.channelSortBy as any,
      parentalControlEnabled: row.parentalControlEnabled === 1,
      parentalControlPin: row.parentalControlPin || undefined,
      showHomeTab: row.showHomeTab === 1,
      showLiveTab: row.showLiveTab === 1,
      showVideosTab: row.showVideosTab === 1,
    };
  }

  async getAllUsers(): Promise<User[]> {
    console.log('[UserRepository] getAllUsers called');
    const rows = await executeQuery<UserRow>(
      'SELECT * FROM users ORDER BY createdAt ASC'
    );

    // Process users sequentially to avoid database locking issues
    const users: User[] = [];
    for (const row of rows) {
      const settings = await this.getUserSettings(row.id);
      users.push(this.rowToUser(row, settings || undefined));
    }

    console.log('[UserRepository] Found', users.length, 'users');
    return users;
  }

  async getUserById(id: string): Promise<User | null> {
    console.log('[UserRepository] getUserById called:', id);
    const row = await executeQuerySingle<UserRow>(
      'SELECT * FROM users WHERE id = ?',
      [id]
    );

    if (!row) {
      console.log('[UserRepository] User not found');
      return null;
    }

    const settings = await this.getUserSettings(id);
    return this.rowToUser(row, settings || undefined);
  }


  async createUser(input: CreateUserInput): Promise<User> {
    console.log('[UserRepository] createUser called:', { username: input.username });

    const now = new Date().toISOString();
    const userId = randomUUID();

    await executeTransaction(async (tx) => {
      // Insert user
      await tx.runAsync(
        `INSERT INTO users (id, username, avatarUrl, pin, createdAt, updatedAt, lastActiveAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          input.username,
          input.avatarUrl || null,
          input.pin || null,
          now,
          now,
          now,
        ]
      );

      // Insert default settings
      await tx.runAsync(
        `INSERT INTO user_settings (userId, theme, language, defaultQuality, defaultSubtitles, activePlaylistId, channelSortBy, parentalControlEnabled, parentalControlPin, showHomeTab, showLiveTab, showVideosTab)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          DEFAULT_USER_SETTINGS.theme,
          DEFAULT_USER_SETTINGS.language,
          DEFAULT_USER_SETTINGS.defaultQuality,
          DEFAULT_USER_SETTINGS.defaultSubtitles,
          DEFAULT_USER_SETTINGS.activePlaylistId || null,
          DEFAULT_USER_SETTINGS.channelSortBy,
          DEFAULT_USER_SETTINGS.parentalControlEnabled ? 1 : 0,
          null,
          DEFAULT_USER_SETTINGS.showHomeTab ? 1 : 0,
          DEFAULT_USER_SETTINGS.showLiveTab ? 1 : 0,
          DEFAULT_USER_SETTINGS.showVideosTab ? 1 : 0,
        ]
      );
    });

    const user = await this.getUserById(userId);
    if (!user) {
      throw new Error('Failed to create user');
    }

    console.log('[UserRepository] User created successfully');
    return user;
  }

  async updateUser(id: string, updates: UpdateUserInput): Promise<User> {
    console.log('[UserRepository] updateUser called:', id);

    const existing = await this.getUserById(id);
    if (!existing) {
      throw new Error(`User with id ${id} not found`);
    }

    await executeStatement(
      `UPDATE users SET username = ?, avatarUrl = ?, pin = ?, updatedAt = ? WHERE id = ?`,
      [
        updates.username ?? existing.username,
        updates.avatarUrl ?? existing.avatarUrl ?? null,
        updates.pin ?? existing.pin ?? null,
        new Date().toISOString(),
        id,
      ]
    );

    const updated = await this.getUserById(id);
    if (!updated) {
      throw new Error('Failed to update user');
    }

    console.log('[UserRepository] User updated successfully');
    return updated;
  }

  async deleteUser(id: string): Promise<void> {
    console.log('[UserRepository] deleteUser called:', id);

    const result = await executeStatement('DELETE FROM users WHERE id = ?', [id]);

    if (result.changes === 0) {
      throw new Error(`User with id ${id} not found`);
    }

    console.log('[UserRepository] User deleted successfully');
  }

  async updateLastActive(id: string): Promise<void> {
    await executeStatement(
      'UPDATE users SET lastActiveAt = ? WHERE id = ?',
      [new Date().toISOString(), id]
    );
  }

  async getUserSettings(userId: string): Promise<UserSettings | null> {
    const row = await executeQuerySingle<UserSettingsRow>(
      'SELECT * FROM user_settings WHERE userId = ?',
      [userId]
    );

    return row ? this.rowToUserSettings(row) : null;
  }

  async updateUserSettings(userId: string, settings: Partial<UserSettings>): Promise<UserSettings> {
    console.log('[UserRepository] updateUserSettings called:', userId);

    const existing = await this.getUserSettings(userId);
    if (!existing) {
      throw new Error(`Settings for user ${userId} not found`);
    }

    const updated = { ...existing, ...settings };

    await executeStatement(
      `UPDATE user_settings
       SET theme = ?, language = ?, defaultQuality = ?, defaultSubtitles = ?, activePlaylistId = ?,
           channelSortBy = ?, parentalControlEnabled = ?, parentalControlPin = ?,
           showHomeTab = ?, showLiveTab = ?, showVideosTab = ?
       WHERE userId = ?`,
      [
        updated.theme,
        updated.language,
        updated.defaultQuality,
        updated.defaultSubtitles,
        updated.activePlaylistId || null,
        updated.channelSortBy,
        updated.parentalControlEnabled ? 1 : 0,
        updated.parentalControlPin || null,
        updated.showHomeTab ? 1 : 0,
        updated.showLiveTab ? 1 : 0,
        updated.showVideosTab ? 1 : 0,
        userId,
      ]
    );

    console.log('[UserRepository] Settings updated successfully');
    return updated;
  }

  async getFavoriteChannels(userId: string): Promise<string[]> {
    const rows = await executeQuery<UserFavoriteChannelRow>(
      'SELECT channelId FROM user_favorite_channels WHERE userId = ? ORDER BY addedAt DESC',
      [userId]
    );

    return rows.map(row => row.channelId);
  }

  async addFavoriteChannel(userId: string, channelId: string): Promise<void> {
    console.log('[UserRepository] addFavoriteChannel called:', { userId, channelId });

    await executeStatement(
      'INSERT OR IGNORE INTO user_favorite_channels (id, userId, channelId, addedAt) VALUES (?, ?, ?, ?)',
      [randomUUID(), userId, channelId, new Date().toISOString()]
    );
  }

  async removeFavoriteChannel(userId: string, channelId: string): Promise<void> {
    console.log('[UserRepository] removeFavoriteChannel called:', { userId, channelId });

    await executeStatement(
      'DELETE FROM user_favorite_channels WHERE userId = ? AND channelId = ?',
      [userId, channelId]
    );
  }

  async isFavoriteChannel(userId: string, channelId: string): Promise<boolean> {
    const row = await executeQuerySingle<{ count: number }>(
      'SELECT COUNT(*) as count FROM user_favorite_channels WHERE userId = ? AND channelId = ?',
      [userId, channelId]
    );

    return (row?.count || 0) > 0;
  }

  async getHiddenChannels(userId: string): Promise<string[]> {
    const rows = await executeQuery<UserHiddenChannelRow>(
      'SELECT channelId FROM user_hidden_channels WHERE userId = ?',
      [userId]
    );

    return rows.map(row => row.channelId);
  }

  async hideChannel(userId: string, channelId: string): Promise<void> {
    console.log('[UserRepository] hideChannel called:', { userId, channelId });

    await executeStatement(
      'INSERT OR IGNORE INTO user_hidden_channels (id, userId, channelId, hiddenAt) VALUES (?, ?, ?, ?)',
      [randomUUID(), userId, channelId, new Date().toISOString()]
    );
  }

  async unhideChannel(userId: string, channelId: string): Promise<void> {
    console.log('[UserRepository] unhideChannel called:', { userId, channelId });

    await executeStatement(
      'DELETE FROM user_hidden_channels WHERE userId = ? AND channelId = ?',
      [userId, channelId]
    );
  }

  async isChannelHidden(userId: string, channelId: string): Promise<boolean> {
    const row = await executeQuerySingle<{ count: number }>(
      'SELECT COUNT(*) as count FROM user_hidden_channels WHERE userId = ? AND channelId = ?',
      [userId, channelId]
    );

    return (row?.count || 0) > 0;
  }

  async getFavoriteGroups(userId: string): Promise<string[]> {
    const rows = await executeQuery<UserFavoriteGroupRow>(
      'SELECT groupName FROM user_favorite_groups WHERE userId = ? ORDER BY addedAt DESC',
      [userId]
    );

    return rows.map(row => row.groupName);
  }

  async addFavoriteGroup(userId: string, groupName: string): Promise<void> {
    console.log('[UserRepository] addFavoriteGroup called:', { userId, groupName });

    await executeStatement(
      'INSERT OR IGNORE INTO user_favorite_groups (id, userId, groupName, addedAt) VALUES (?, ?, ?, ?)',
      [randomUUID(), userId, groupName, new Date().toISOString()]
    );
  }

  async removeFavoriteGroup(userId: string, groupName: string): Promise<void> {
    console.log('[UserRepository] removeFavoriteGroup called:', { userId, groupName });

    await executeStatement(
      'DELETE FROM user_favorite_groups WHERE userId = ? AND groupName = ?',
      [userId, groupName]
    );
  }

  async isFavoriteGroup(userId: string, groupName: string): Promise<boolean> {
    const row = await executeQuerySingle<{ count: number }>(
      'SELECT COUNT(*) as count FROM user_favorite_groups WHERE userId = ? AND groupName = ?',
      [userId, groupName]
    );

    return (row?.count || 0) > 0;
  }

  async getChannelOrder(userId: string): Promise<Map<string, number>> {
    const rows = await executeQuery<UserChannelOrderRow>(
      'SELECT channelId, sortOrder FROM user_channel_order WHERE userId = ?',
      [userId]
    );

    const orderMap = new Map<string, number>();
    rows.forEach(row => {
      orderMap.set(row.channelId, row.sortOrder);
    });

    return orderMap;
  }

  async setChannelOrder(userId: string, channelId: string, order: number): Promise<void> {
    console.log('[UserRepository] setChannelOrder called:', { userId, channelId, order });

    await executeStatement(
      `INSERT INTO user_channel_order (id, userId, channelId, sortOrder)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(userId, channelId) DO UPDATE SET sortOrder = ?`,
      [randomUUID(), userId, channelId, order, order]
    );
  }

  async clearChannelOrder(userId: string): Promise<void> {
    console.log('[UserRepository] clearChannelOrder called:', userId);

    await executeStatement(
      'DELETE FROM user_channel_order WHERE userId = ?',
      [userId]
    );
  }

  async addWatchHistory(userId: string, channelId: string, duration: number): Promise<void> {
    console.log('[UserRepository] addWatchHistory called:', { userId, channelId, duration });

    await executeStatement(
      'INSERT INTO user_watch_history (id, userId, channelId, watchedAt, duration) VALUES (?, ?, ?, ?, ?)',
      [randomUUID(), userId, channelId, new Date().toISOString(), duration]
    );
  }

  async getWatchHistory(userId: string, limit: number = 50): Promise<UserWatchHistory[]> {
    const rows = await executeQuery<UserWatchHistoryRow>(
      'SELECT * FROM user_watch_history WHERE userId = ? ORDER BY watchedAt DESC LIMIT ?',
      [userId, limit]
    );

    return rows.map(row => ({
      id: row.id,
      userId: row.userId,
      channelId: row.channelId,
      watchedAt: new Date(row.watchedAt),
      duration: row.duration,
    }));
  }

  async clearWatchHistory(userId: string): Promise<void> {
    console.log('[UserRepository] clearWatchHistory called:', userId);

    await executeStatement(
      'DELETE FROM user_watch_history WHERE userId = ?',
      [userId]
    );
  }

  async savePlaybackPosition(userId: string, channelId: string, position: number, totalDuration: number): Promise<void> {
    console.log('[UserRepository] savePlaybackPosition called:', { userId, channelId, position });

    await executeStatement(
      `INSERT INTO user_playback_position (id, userId, channelId, position, totalDuration, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(userId, channelId) DO UPDATE SET position = ?, totalDuration = ?, updatedAt = ?`,
      [
        randomUUID(), userId, channelId, position, totalDuration, new Date().toISOString(),
        position, totalDuration, new Date().toISOString(),
      ]
    );
  }

  async getPlaybackPosition(userId: string, channelId: string): Promise<UserPlaybackPosition | null> {
    const row = await executeQuerySingle<UserPlaybackPositionRow>(
      'SELECT * FROM user_playback_position WHERE userId = ? AND channelId = ?',
      [userId, channelId]
    );

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      userId: row.userId,
      channelId: row.channelId,
      position: row.position,
      totalDuration: row.totalDuration,
      updatedAt: new Date(row.updatedAt),
    };
  }

  async clearPlaybackPosition(userId: string, channelId: string): Promise<void> {
    console.log('[UserRepository] clearPlaybackPosition called:', { userId, channelId });

    await executeStatement(
      'DELETE FROM user_playback_position WHERE userId = ? AND channelId = ?',
      [userId, channelId]
    );
  }

  async migrateFavoritesToNewFormat(userId: string, channels: { name: string; url: string; tvg?: { id?: string } }[]): Promise<void> {
    console.log('[UserRepository] migrateFavoritesToNewFormat called for user:', userId);

    const favorites = await this.getFavoriteChannels(userId);
    const channelMap = new Map<string, string>();

    // Create mapping from old formats to new tvg.id based format
    channels.forEach(channel => {
      const newChannelId = getChannelId(channel as any);

      // Map from old name-only format
      channelMap.set(channel.name, newChannelId);

      // Map from old name|url format
      const oldNameUrlFormat = `${channel.name}|${channel.url}`;
      channelMap.set(oldNameUrlFormat, newChannelId);
    });

    let migratedCount = 0;
    for (const favoriteId of favorites) {
      // Check if this favorite needs migration
      if (channelMap.has(favoriteId)) {
        const newChannelId = channelMap.get(favoriteId)!;

        // Only migrate if the new ID is different
        if (newChannelId !== favoriteId) {
          try {
            // Remove old favorite
            await this.removeFavoriteChannel(userId, favoriteId);
            // Add new favorite with proper format
            await this.addFavoriteChannel(userId, newChannelId);
            migratedCount++;
          } catch (error) {
            console.error('[UserRepository] Error migrating favorite:', favoriteId, error);
          }
        }
      }
    }

    if (migratedCount > 0) {
      console.log(`[UserRepository] Migrated ${migratedCount} favorites to new format`);
    }
  }
}

/**
 * Factory function to create the user repository instance
 */
export function createUserRepository(): IUserRepository {
  return new SQLiteUserRepository();
}

/**
 * Singleton instance of the user repository
 */
export const userRepository = createUserRepository();
