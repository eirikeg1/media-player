import { stripEpisodeInfo } from '@/lib/series-utils';
import { COMPLETION_RATIO, RESUME_MIN_SECONDS, isCompleted } from '@/lib/viewing-progress';
import type {
    ContentReaction,
    ContentReactionValue,
    ContentType,
    ContinueWatchingItem,
    CreateUserInput,
    RecentlyWatchedItem,
    SportsBackgroundRefresh,
    SportsRefreshMode,
    UpdateUserInput,
    User,
    UserSettings,
    ViewingSession,
    WatchedContent,
} from '@/types/user.types';
import { DEFAULT_USER_SETTINGS } from '@/types/user.types';
import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import { executeQuery, executeQuerySingle, executeStatement, executeTransaction } from './sqlite-client';

/** Filters for `getRecentlyWatched`. */
export interface RecentlyWatchedOptions {
  /**
   * Drop live channels. Callers that only render movies and series would
   * otherwise have to over-fetch and filter in JS, since live viewing dominates
   * the history.
   */
  excludeLive?: boolean;
}

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

  // Content reactions operations (like/dislike on movies/series)
  getContentReactions(userId: string): Promise<ContentReaction[]>;
  setContentReaction(userId: string, channelId: string, reaction: ContentReactionValue | null): Promise<void>;

  // Favorite groups operations
  getFavoriteGroups(userId: string): Promise<string[]>;
  addFavoriteGroup(userId: string, groupName: string): Promise<void>;
  removeFavoriteGroup(userId: string, groupName: string): Promise<void>;
  isFavoriteGroup(userId: string, groupName: string): Promise<boolean>;

  // Viewing history operations
  startViewingSession(params: {
    userId: string;
    playlistId: string;
    channelId: string;
    channelName: string;
    groupTitle?: string;
    contentType: ContentType;
    tvgLogo?: string;
    startPosition?: number;
    totalDuration?: number;
  }): Promise<string>;
  updateSessionProgress(sessionId: string, endPosition: number, durationWatched: number, totalDuration?: number): Promise<void>;
  endViewingSession(sessionId: string, endPosition: number, durationWatched: number, completed: boolean): Promise<void>;
  closeOrphanedSessions(activeSessionId?: string): Promise<void>;
  getContinueWatching(userId: string, playlistId: string, limit?: number): Promise<ContinueWatchingItem[]>;
  getRecentlyWatched(
    userId: string,
    playlistId: string,
    limit?: number,
    options?: RecentlyWatchedOptions,
  ): Promise<RecentlyWatchedItem[]>;
  getWatchStatsForChannels(
    userId: string,
    playlistId: string,
    channelIds: string[],
  ): Promise<RecentlyWatchedItem | null>;
  getWatchedContent(userId: string, playlistId: string): Promise<WatchedContent>;
  getViewingHistory(userId: string, limit?: number): Promise<ViewingSession[]>;
  clearViewingHistory(userId: string): Promise<void>;
  setNextEpisode(
    userId: string,
    playlistId: string,
    channel: WatchStatsChannel,
    next: { channelId: string; channelName: string },
  ): Promise<void>;
  getSavedPosition(userId: string, playlistId: string, channelId: string): Promise<{ lastPosition: number; totalDuration?: number } | null>;
}

/**
 * Everything a `channel_watch_stats` row needs to name the channel it is about.
 *
 * A write that finds no row has to be able to create one, and the identity
 * columns are `NOT NULL` — a placeholder row would surface in the recently
 * watched list under an empty name.
 */
export interface WatchStatsChannel {
  channelId: string;
  channelName: string;
  groupTitle?: string;
  contentType: ContentType;
  tvgLogo?: string;
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

/** Parse the JSON array of competition ids stored in `sportsLeagueOrder`. */
function parseLeagueOrder(raw: string | null): number[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((id) => typeof id === 'number')) {
      return parsed;
    }
  } catch {
    // Corrupt value — fall back to the default order.
  }
  return undefined;
}

const REFRESH_MODES: readonly SportsRefreshMode[] = ['off', 'interval', 'daily', 'night'];

/** Parse the JSON object stored in `sportsBackgroundRefresh`. */
function parseBackgroundRefresh(raw: string | null): SportsBackgroundRefresh | undefined {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const { mode, intervalHours, dailyTime, refreshOnOpen } = parsed as Record<string, unknown>;
      if (
        REFRESH_MODES.includes(mode as SportsRefreshMode) &&
        typeof intervalHours === 'number' &&
        Number.isFinite(intervalHours) &&
        typeof dailyTime === 'string' &&
        typeof refreshOnOpen === 'boolean'
      ) {
        return { mode: mode as SportsRefreshMode, intervalHours, dailyTime, refreshOnOpen };
      }
    }
  } catch {
    // Corrupt value — fall back to the default schedule.
  }
  return undefined;
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
  showSportsTab: number;
  playlistSharingEnabled: number;
  privateModeExpiresAt: string | null;
  shareUploadedBackgrounds: number;
  sportsCountry: string | null;
  sportsLeagueOrder: string | null;
  sportsHideOtherLeagues: number;
  sportsBackgroundRefresh: string | null;
}

/**
 * A session still open after this long was left behind by a crash rather than
 * by a viewer who is still watching.
 */
const ORPHANED_SESSION_MIN_AGE_MS = 60 * 60 * 1000;

/**
 * SQL mirror of `isInProgress` in `@/lib/viewing-progress`, for filtering
 * `channel_watch_stats` inside the query instead of over-fetching and filtering
 * in JS. Keep the shape of the condition in sync with that function.
 *
 * The thresholds are interpolated from the shared constants (both plain numbers,
 * never user input) rather than bound as parameters: SQLite can only use the
 * `idx_cws_resume` partial index when the query's condition provably implies the
 * index's own — and it cannot prove anything about the value behind a `?`.
 *
 * The `totalDuration <= 0` disjunct still keeps that implication out of reach
 * (the index has no such term), and it stays: dropping it would part company
 * with `isInProgress`, which resumes a row of unknown duration. Adding the term
 * to the index means a migration that rebuilds it.
 */
const IN_PROGRESS_SQL = `
  AND lastPosition >= ${RESUME_MIN_SECONDS}
  AND (totalDuration IS NULL OR totalDuration <= 0 OR lastPosition < totalDuration * ${COMPLETION_RATIO})
`;

/** `IN (…)` lists are chunked to stay well below SQLite's variable limit. */
const CHANNEL_ID_CHUNK_SIZE = 500;

/** Columns behind a `RecentlyWatchedItem`. */
const WATCH_STATS_COLUMNS = `channelId, channelName, groupTitle, contentType, tvgLogo, watchCount,
  lastWatchedAt, lastPosition, totalDuration, nextEpisodeChannelId, nextEpisodeChannelName`;

type ColumnValue = string | number | null;

const toInteger = (value: unknown): ColumnValue => (value ? 1 : 0);
const toTextOrNull = (value: unknown): ColumnValue => (value ? String(value) : null);
const toJsonOrNull = (value: unknown): ColumnValue => (value ? JSON.stringify(value) : null);

/**
 * How each settings field is written to its column.
 *
 * `updateUserSettings` builds its `SET` clause from the keys of the patch it is
 * given, so two concurrent toggles of different settings can no longer overwrite
 * each other with a stale full-row read.
 */
const SETTINGS_COLUMN_WRITERS: {
  [K in keyof Omit<UserSettings, 'userId'>]: (value: UserSettings[K]) => ColumnValue;
} = {
  theme: (value) => value,
  language: (value) => value,
  defaultQuality: (value) => value,
  defaultSubtitles: (value) => value,
  activePlaylistId: toTextOrNull,
  channelSortBy: (value) => value,
  parentalControlEnabled: toInteger,
  parentalControlPin: toTextOrNull,
  showHomeTab: toInteger,
  showLiveTab: toInteger,
  showVideosTab: toInteger,
  showSportsTab: toInteger,
  playlistSharingEnabled: toInteger,
  privateModeExpiresAt: toTextOrNull,
  shareUploadedBackgrounds: toInteger,
  sportsCountry: toTextOrNull,
  sportsLeagueOrder: toJsonOrNull,
  sportsHideOtherLeagues: toInteger,
  sportsBackgroundRefresh: toJsonOrNull,
};

type SettingsColumn = keyof typeof SETTINGS_COLUMN_WRITERS;

/**
 * The settings columns that accept NULL, and therefore the only ones for which a
 * patch may carry `undefined` — there it means "clear this". Every other column
 * is NOT NULL, so an explicit `undefined` (a caller spreading an optional field)
 * must be skipped rather than written as a null or a coerced 0/'undefined'.
 */
const NULLABLE_SETTINGS_COLUMNS = new Set<SettingsColumn>([
  'activePlaylistId',
  'parentalControlPin',
  'privateModeExpiresAt',
  'sportsCountry',
  'sportsLeagueOrder',
  'sportsBackgroundRefresh',
]);

interface UserFavoriteChannelRow {
  id: string;
  userId: string;
  channelId: string;
  addedAt: string;
}

interface UserContentReactionRow {
  id: string;
  userId: string;
  channelId: string;
  reaction: number;
  createdAt: string;
}

interface UserFavoriteGroupRow {
  id: string;
  userId: string;
  groupName: string;
  addedAt: string;
}

interface ViewingSessionRow {
  id: string;
  userId: string;
  playlistId: string;
  channelId: string;
  channelName: string;
  groupTitle: string | null;
  contentType: string;
  tvgLogo: string | null;
  startedAt: string;
  endedAt: string | null;
  durationWatched: number;
  startPosition: number;
  endPosition: number;
  totalDuration: number | null;
  dayOfWeek: number;
  hourOfDay: number;
  completed: number;
}

interface ContinueWatchingRow {
  channelId: string;
  channelName: string;
  groupTitle: string | null;
  contentType: string;
  tvgLogo: string | null;
  lastPosition: number;
  totalDuration: number | null;
  lastWatchedAt: string;
}

interface WatchedContentRow {
  channelId: string;
  channelName: string;
  contentType: string;
  completionCount: number;
}

interface RecentlyWatchedRow {
  channelId: string;
  channelName: string;
  groupTitle: string | null;
  contentType: string;
  tvgLogo: string | null;
  watchCount: number;
  lastWatchedAt: string;
  lastPosition: number;
  totalDuration: number | null;
  nextEpisodeChannelId: string | null;
  nextEpisodeChannelName: string | null;
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
      showSportsTab: row.showSportsTab === 1,
      playlistSharingEnabled: row.playlistSharingEnabled === 1,
      privateModeExpiresAt: row.privateModeExpiresAt || undefined,
      shareUploadedBackgrounds: row.shareUploadedBackgrounds === 1,
      sportsCountry: row.sportsCountry || undefined,
      sportsLeagueOrder: parseLeagueOrder(row.sportsLeagueOrder),
      sportsHideOtherLeagues: row.sportsHideOtherLeagues === 1,
      sportsBackgroundRefresh: parseBackgroundRefresh(row.sportsBackgroundRefresh),
    };
  }

  async getAllUsers(): Promise<User[]> {
    console.log('[UserRepository] getAllUsers called');
    // One query, not one per user: this runs on the boot critical path. The two
    // tables share no column name, so the joined row is both row shapes at
    // once; a user without settings yields NULLs for every settings column
    // (including `userId`, which the schema declares NOT NULL).
    const rows = await executeQuery<UserRow & Partial<UserSettingsRow>>(
      `SELECT u.*, s.*
       FROM users u
       LEFT JOIN user_settings s ON s.userId = u.id
       ORDER BY u.createdAt ASC`
    );

    const users = rows.map((row) =>
      this.rowToUser(row, row.userId ? this.rowToUserSettings(row as UserSettingsRow) : undefined),
    );

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
        `INSERT INTO user_settings (userId, theme, language, defaultQuality, defaultSubtitles, activePlaylistId, channelSortBy, parentalControlEnabled, parentalControlPin, showHomeTab, showLiveTab, showVideosTab, showSportsTab, playlistSharingEnabled, privateModeExpiresAt, shareUploadedBackgrounds, sportsCountry, sportsLeagueOrder, sportsHideOtherLeagues, sportsBackgroundRefresh)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          DEFAULT_USER_SETTINGS.showSportsTab ? 1 : 0,
          DEFAULT_USER_SETTINGS.playlistSharingEnabled ? 1 : 0,
          null,
          DEFAULT_USER_SETTINGS.shareUploadedBackgrounds ? 1 : 0,
          null,
          null,
          DEFAULT_USER_SETTINGS.sportsHideOtherLeagues ? 1 : 0,
          null,
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

    const existing = await executeQuerySingle<{ id: string }>(
      'SELECT id FROM users WHERE id = ?',
      [id]
    );
    if (!existing) {
      throw new Error(`User with id ${id} not found`);
    }

    // Dependent rows are deleted explicitly rather than relying on the
    // ON DELETE CASCADE clauses: the cascades only fire while
    // PRAGMA foreign_keys is on, and the tables the Rust catalog owns
    // (favorites, watch stats) have no foreign key to cascade from at all.
    const dependentTables = [
      'user_settings',
      'user_favorite_channels',
      'user_hidden_channels',
      'user_channel_order',
      'user_favorite_groups',
      'user_content_reactions',
      'viewing_sessions',
      'channel_watch_stats',
      'group_watch_stats',
      'user_uploaded_backgrounds',
      'user_header_selections',
    ];

    await executeTransaction(async (db) => {
      for (const table of dependentTables) {
        await db.runAsync(`DELETE FROM ${table} WHERE userId = ?`, [id]);
      }

      // Playlists outlive their creator: `createdByUserId` becomes NULL, which
      // `getVisiblePlaylists` treats as "shared with everyone". Deleting them
      // instead would take the imported channels of the remaining users with
      // them, and leaving the id dangling would hide the playlist from
      // everyone (no row in `users` can ever match it again).
      await db.runAsync(
        'UPDATE playlists SET createdByUserId = NULL WHERE createdByUserId = ?',
        [id]
      );

      await db.runAsync('DELETE FROM users WHERE id = ?', [id]);
    });

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

    // Only the patched columns are written: a full-row write would clobber
    // settings another screen changed between the read above and this write.
    // `updated` mirrors exactly what was written, so a skipped key keeps the
    // stored value instead of reporting the `undefined` that was skipped.
    const updated: UserSettings = { ...existing };
    const assignments: string[] = [];
    const params: ColumnValue[] = [];
    for (const key of Object.keys(settings) as SettingsColumn[]) {
      const writer = SETTINGS_COLUMN_WRITERS[key];
      if (!writer) continue; // `userId` and anything unknown are not writable
      if (settings[key] === undefined && !NULLABLE_SETTINGS_COLUMNS.has(key)) continue;
      assignments.push(`${key} = ?`);
      params.push(writer(settings[key] as never));
      Object.assign(updated, { [key]: settings[key] });
    }

    if (assignments.length === 0) {
      return updated;
    }

    await executeStatement(
      `UPDATE user_settings SET ${assignments.join(', ')} WHERE userId = ?`,
      [...params, userId]
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

  async getContentReactions(userId: string): Promise<ContentReaction[]> {
    const rows = await executeQuery<UserContentReactionRow>(
      'SELECT channelId, reaction, createdAt FROM user_content_reactions WHERE userId = ?',
      [userId]
    );

    return rows.map(row => ({
      channelId: row.channelId,
      reaction: row.reaction as ContentReactionValue,
      createdAt: row.createdAt,
    }));
  }

  async setContentReaction(userId: string, channelId: string, reaction: ContentReactionValue | null): Promise<void> {
    console.log('[UserRepository] setContentReaction called:', { userId, channelId, reaction });

    if (reaction === null) {
      await executeStatement(
        'DELETE FROM user_content_reactions WHERE userId = ? AND channelId = ?',
        [userId, channelId]
      );
      return;
    }

    await executeStatement(
      `INSERT INTO user_content_reactions (id, userId, channelId, reaction, createdAt)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(userId, channelId) DO UPDATE SET reaction = excluded.reaction, createdAt = excluded.createdAt`,
      [randomUUID(), userId, channelId, reaction, new Date().toISOString()]
    );
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

  // ── Viewing History ──

  async startViewingSession(params: {
    userId: string;
    playlistId: string;
    channelId: string;
    channelName: string;
    groupTitle?: string;
    contentType: ContentType;
    tvgLogo?: string;
    startPosition?: number;
    totalDuration?: number;
  }): Promise<string> {
    const id = randomUUID();
    const now = new Date();
    const startedAt = now.toISOString();

    await executeStatement(
      `INSERT INTO viewing_sessions
        (id, userId, playlistId, channelId, channelName, groupTitle, contentType, tvgLogo,
         startedAt, startPosition, totalDuration, dayOfWeek, hourOfDay)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        params.userId,
        params.playlistId,
        params.channelId,
        params.channelName,
        params.groupTitle ?? null,
        params.contentType,
        params.tvgLogo ?? null,
        startedAt,
        params.startPosition ?? 0,
        params.totalDuration ?? null,
        now.getDay(),
        now.getHours(),
      ]
    );

    console.log('[UserRepository] Started viewing session:', id);
    return id;
  }

  async updateSessionProgress(sessionId: string, endPosition: number, durationWatched: number, totalDuration?: number): Promise<void> {
    await executeStatement(
      `UPDATE viewing_sessions SET endPosition = ?, durationWatched = ?, totalDuration = COALESCE(?, totalDuration) WHERE id = ?`,
      [endPosition, durationWatched, totalDuration ?? null, sessionId]
    );
  }

  /**
   * Shared aggregation logic: UPSERT channel_watch_stats and group_watch_stats.
   * Called by both endViewingSession and closeOrphanedSessions.
   */
  private async aggregateSessionStats(
    db: SQLiteDatabase,
    session: ViewingSessionRow,
    endPosition: number,
    durationWatched: number,
    completed: boolean,
    now: string,
  ): Promise<void> {
    // `nextEpisodeChannelId`/`Name` are deliberately left untouched: they are
    // resolved while an episode is still playing (at the ~90% mark), so wiping
    // them when the session closes would throw away the pointer that the home
    // rows are about to read. `setNextEpisode` overwrites them instead.

    // Read before the UPSERT below: afterwards the row always exists (and
    // carries this session's groupTitle), so "have we seen this channel in this
    // group before?" can no longer be answered.
    //
    // `watchCount > 0` rather than mere existence: `setNextEpisode` creates the
    // row mid-episode with no watch recorded, and that must not make the first
    // completed watch of a channel look like a repeat.
    const isNewChannelInGroup = session.groupTitle
      ? !(await db.getFirstAsync<{ one: number }>(
          `SELECT 1 as one FROM channel_watch_stats
           WHERE userId = ? AND playlistId = ? AND groupTitle = ? AND channelId = ?
             AND watchCount > 0`,
          [session.userId, session.playlistId, session.groupTitle, session.channelId]
        ))
      : false;

    // UPSERT channel_watch_stats
    await db.runAsync(
      `INSERT INTO channel_watch_stats
        (userId, playlistId, channelId, channelName, groupTitle, contentType, tvgLogo,
         watchCount, totalTimeWatched, lastWatchedAt, firstWatchedAt, lastPosition,
         totalDuration, completionCount, avgSessionDuration, longestSessionDuration)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(userId, playlistId, channelId) DO UPDATE SET
         channelName = excluded.channelName,
         groupTitle = excluded.groupTitle,
         tvgLogo = excluded.tvgLogo,
         watchCount = watchCount + 1,
         totalTimeWatched = totalTimeWatched + excluded.totalTimeWatched,
         lastWatchedAt = excluded.lastWatchedAt,
         lastPosition = excluded.lastPosition,
         totalDuration = COALESCE(excluded.totalDuration, totalDuration),
         completionCount = completionCount + excluded.completionCount,
         avgSessionDuration = (totalTimeWatched + excluded.totalTimeWatched) / (watchCount + 1),
         longestSessionDuration = MAX(longestSessionDuration, excluded.longestSessionDuration)`,
      [
        session.userId,
        session.playlistId,
        session.channelId,
        session.channelName,
        session.groupTitle,
        session.contentType,
        session.tvgLogo,
        durationWatched,
        now,
        now,
        endPosition,
        session.totalDuration,
        completed ? 1 : 0,
        durationWatched,
        durationWatched,
      ]
    );

    // UPSERT group_watch_stats (only if groupTitle exists)
    if (session.groupTitle) {
      await db.runAsync(
        `INSERT INTO group_watch_stats
          (userId, playlistId, groupTitle, watchCount, totalTimeWatched, uniqueChannelsWatched, lastWatchedAt)
         VALUES (?, ?, ?, 1, ?, ?, ?)
         ON CONFLICT(userId, playlistId, groupTitle) DO UPDATE SET
           watchCount = watchCount + 1,
           totalTimeWatched = totalTimeWatched + ?,
           uniqueChannelsWatched = uniqueChannelsWatched + ?,
           lastWatchedAt = ?`,
        [
          session.userId,
          session.playlistId,
          session.groupTitle,
          durationWatched,
          isNewChannelInGroup ? 1 : 0,
          now,
          durationWatched,
          isNewChannelInGroup ? 1 : 0,
          now,
        ]
      );
    }
  }

  async endViewingSession(sessionId: string, endPosition: number, durationWatched: number, completed: boolean): Promise<void> {
    const now = new Date().toISOString();

    await executeTransaction(async (db) => {
      // 1. Finalize the session row
      await db.runAsync(
        `UPDATE viewing_sessions
         SET endedAt = ?, endPosition = ?, durationWatched = ?, completed = ?
         WHERE id = ?`,
        [now, endPosition, durationWatched, completed ? 1 : 0, sessionId]
      );

      // 2. Read back session data for aggregation
      const session = await db.getFirstAsync<ViewingSessionRow>(
        `SELECT * FROM viewing_sessions WHERE id = ?`,
        [sessionId]
      );
      if (!session) return;

      // 3. Aggregate into stats tables
      await this.aggregateSessionStats(db, session, endPosition, durationWatched, completed, now);
    });

    console.log('[UserRepository] Ended viewing session:', sessionId);
  }

  /**
   * Close viewing sessions a crash left open, aggregating them like a normal
   * end-of-session would.
   *
   * Only sessions older than {@link ORPHANED_SESSION_MIN_AGE_MS} qualify, and
   * the caller's own session is excluded: a session that is still playing must
   * not be closed and counted here, or the same watch lands in the stats twice.
   */
  async closeOrphanedSessions(activeSessionId?: string): Promise<void> {
    const now = new Date();
    const nowIso = now.toISOString();
    const cutoff = new Date(now.getTime() - ORPHANED_SESSION_MIN_AGE_MS).toISOString();

    const orphans = await executeQuery<ViewingSessionRow>(
      `SELECT * FROM viewing_sessions
       WHERE endedAt IS NULL AND startedAt < ? AND id IS NOT ?`,
      [cutoff, activeSessionId ?? null]
    );
    if (orphans.length === 0) return;

    console.log(`[UserRepository] Closing ${orphans.length} orphaned viewing sessions`);

    await executeTransaction(async (db) => {
      for (const session of orphans) {
        const completed = isCompleted(session.endPosition, session.totalDuration);

        await db.runAsync(
          'UPDATE viewing_sessions SET endedAt = ?, completed = ? WHERE id = ?',
          [nowIso, completed ? 1 : 0, session.id]
        );
        await this.aggregateSessionStats(
          db, session, session.endPosition, session.durationWatched, completed, nowIso
        );
      }
    });
  }

  async getContinueWatching(userId: string, playlistId: string, limit: number = 20): Promise<ContinueWatchingItem[]> {
    const rows = await executeQuery<ContinueWatchingRow>(
      `SELECT channelId, channelName, groupTitle, contentType, tvgLogo, lastPosition, totalDuration, lastWatchedAt
       FROM channel_watch_stats
       WHERE userId = ? AND playlistId = ?
         ${IN_PROGRESS_SQL}
       ORDER BY lastWatchedAt DESC
       LIMIT ?`,
      [userId, playlistId, limit]
    );

    return rows.map(row => ({
      channelId: row.channelId,
      channelName: row.channelName,
      groupTitle: row.groupTitle ?? undefined,
      contentType: row.contentType as ContentType,
      tvgLogo: row.tvgLogo ?? undefined,
      lastPosition: row.lastPosition,
      totalDuration: row.totalDuration ?? undefined,
      lastWatchedAt: row.lastWatchedAt,
    }));
  }

  private rowToRecentlyWatched(row: RecentlyWatchedRow): RecentlyWatchedItem {
    return {
      channelId: row.channelId,
      channelName: row.channelName,
      groupTitle: row.groupTitle ?? undefined,
      contentType: row.contentType as ContentType,
      tvgLogo: row.tvgLogo ?? undefined,
      watchCount: row.watchCount,
      lastWatchedAt: row.lastWatchedAt,
      lastPosition: row.lastPosition || undefined,
      totalDuration: row.totalDuration ?? undefined,
      nextEpisodeChannelId: row.nextEpisodeChannelId ?? undefined,
      nextEpisodeChannelName: row.nextEpisodeChannelName ?? undefined,
    };
  }

  async getRecentlyWatched(
    userId: string,
    playlistId: string,
    limit: number = 20,
    options: RecentlyWatchedOptions = {},
  ): Promise<RecentlyWatchedItem[]> {
    const rows = await executeQuery<RecentlyWatchedRow>(
      `SELECT ${WATCH_STATS_COLUMNS}
       FROM channel_watch_stats
       WHERE userId = ? AND playlistId = ?
         ${options.excludeLive ? "AND contentType != 'live'" : ''}
       ORDER BY lastWatchedAt DESC
       LIMIT ?`,
      [userId, playlistId, limit]
    );

    return rows.map((row) => this.rowToRecentlyWatched(row));
  }

  /**
   * The most recently watched of the given channels, or null if none of them
   * has ever been watched.
   *
   * Lets callers ask about one specific series (its episode ids) instead of
   * paging through the whole history and hoping the series is recent enough to
   * appear.
   */
  async getWatchStatsForChannels(
    userId: string,
    playlistId: string,
    channelIds: string[],
  ): Promise<RecentlyWatchedItem | null> {
    let mostRecent: RecentlyWatchedRow | null = null;

    for (let offset = 0; offset < channelIds.length; offset += CHANNEL_ID_CHUNK_SIZE) {
      const chunk = channelIds.slice(offset, offset + CHANNEL_ID_CHUNK_SIZE);
      const placeholders = chunk.map(() => '?').join(', ');

      const row = await executeQuerySingle<RecentlyWatchedRow>(
        `SELECT ${WATCH_STATS_COLUMNS}
         FROM channel_watch_stats
         WHERE userId = ? AND playlistId = ? AND channelId IN (${placeholders})
         ORDER BY lastWatchedAt DESC
         LIMIT 1`,
        [userId, playlistId, ...chunk]
      );

      // ISO-8601 timestamps sort lexicographically, so comparing the chunk
      // winners as strings picks the overall most recent row.
      if (row && (!mostRecent || row.lastWatchedAt > mostRecent.lastWatchedAt)) {
        mostRecent = row;
      }
    }

    return mostRecent ? this.rowToRecentlyWatched(mostRecent) : null;
  }

  /**
   * The user's watch history for one playlist, as consumed by the
   * recommendation engine: the seen set plus the completed watches it treats as
   * an implicit "probably liked".
   *
   * Series names are derived from the stored episode titles with
   * `stripEpisodeInfo` — the TS port of the same SQL function the Rust import
   * uses to group episodes into series. That matching is exact for the common
   * case and simply fails to match (rather than excluding the wrong series)
   * when a channel's `tvgName` differs from its title, which is the only case
   * the two derivations can disagree on.
   *
   * A series' completed count is a count of distinct completed episode
   * channels, not of completed sessions: rewatching one episode three times is
   * not the same signal as finishing three episodes.
   */
  async getWatchedContent(userId: string, playlistId: string): Promise<WatchedContent> {
    const rows = await executeQuery<WatchedContentRow>(
      `SELECT channelId, channelName, contentType, completionCount
       FROM channel_watch_stats
       WHERE userId = ? AND playlistId = ?`,
      [userId, playlistId]
    );

    const seriesNames = new Set<string>();
    const completedChannelIds: string[] = [];
    const completedEpisodesBySeries: Record<string, number> = {};

    for (const row of rows) {
      const isCompleted = row.completionCount > 0;

      if (row.contentType === 'series') {
        const seriesName = stripEpisodeInfo(row.channelName);
        seriesNames.add(seriesName);
        if (isCompleted) {
          completedEpisodesBySeries[seriesName] = (completedEpisodesBySeries[seriesName] ?? 0) + 1;
        }
      } else if (row.contentType === 'movie' && isCompleted) {
        completedChannelIds.push(row.channelId);
      }
    }

    return {
      channelIds: rows.map((row) => row.channelId),
      seriesNames: [...seriesNames],
      completedChannelIds,
      completedEpisodesBySeries,
    };
  }

  async getViewingHistory(userId: string, limit: number = 50): Promise<ViewingSession[]> {
    const rows = await executeQuery<ViewingSessionRow>(
      `SELECT * FROM viewing_sessions
       WHERE userId = ?
       ORDER BY startedAt DESC
       LIMIT ?`,
      [userId, limit]
    );

    return rows.map(row => ({
      id: row.id,
      userId: row.userId,
      playlistId: row.playlistId,
      channelId: row.channelId,
      channelName: row.channelName,
      groupTitle: row.groupTitle ?? undefined,
      contentType: row.contentType as ContentType,
      tvgLogo: row.tvgLogo ?? undefined,
      startedAt: row.startedAt,
      endedAt: row.endedAt ?? undefined,
      durationWatched: row.durationWatched,
      startPosition: row.startPosition,
      endPosition: row.endPosition,
      totalDuration: row.totalDuration ?? undefined,
      dayOfWeek: row.dayOfWeek,
      hourOfDay: row.hourOfDay,
      completed: row.completed === 1,
    }));
  }

  async clearViewingHistory(userId: string): Promise<void> {
    console.log('[UserRepository] clearViewingHistory called:', userId);
    await executeTransaction(async (db) => {
      await db.runAsync('DELETE FROM viewing_sessions WHERE userId = ?', [userId]);
      await db.runAsync('DELETE FROM channel_watch_stats WHERE userId = ?', [userId]);
      await db.runAsync('DELETE FROM group_watch_stats WHERE userId = ?', [userId]);
    });
  }

  /**
   * Point a watched episode at the one that follows it.
   *
   * An UPSERT rather than an UPDATE: the pointer is resolved at the ~90 % mark,
   * while the episode is still playing, and on a first watch the stats row is
   * only created when the session ends. An UPDATE would quietly write nothing
   * and a force-close would lose the pointer the eager resolution exists for.
   * The created row carries no watch yet — `endViewingSession` fills the stats
   * in when the session closes.
   */
  async setNextEpisode(
    userId: string,
    playlistId: string,
    channel: WatchStatsChannel,
    next: { channelId: string; channelName: string },
  ): Promise<void> {
    const now = new Date().toISOString();
    await executeStatement(
      `INSERT INTO channel_watch_stats
        (userId, playlistId, channelId, channelName, groupTitle, contentType, tvgLogo,
         watchCount, totalTimeWatched, lastWatchedAt, firstWatchedAt, lastPosition,
         completionCount, avgSessionDuration, longestSessionDuration,
         nextEpisodeChannelId, nextEpisodeChannelName)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, 0, 0, 0, 0, ?, ?)
       ON CONFLICT(userId, playlistId, channelId) DO UPDATE SET
         nextEpisodeChannelId = excluded.nextEpisodeChannelId,
         nextEpisodeChannelName = excluded.nextEpisodeChannelName`,
      [
        userId,
        playlistId,
        channel.channelId,
        channel.channelName,
        channel.groupTitle ?? null,
        channel.contentType,
        channel.tvgLogo ?? null,
        now,
        now,
        next.channelId,
        next.channelName,
      ]
    );
  }

  async getSavedPosition(userId: string, playlistId: string, channelId: string): Promise<{ lastPosition: number; totalDuration?: number } | null> {
    const row = await executeQuerySingle<{ lastPosition: number; totalDuration: number | null }>(
      `SELECT lastPosition, totalDuration FROM channel_watch_stats
       WHERE userId = ? AND playlistId = ? AND channelId = ?
         ${IN_PROGRESS_SQL}`,
      [userId, playlistId, channelId]
    );
    if (!row) return null;
    return { lastPosition: row.lastPosition, totalDuration: row.totalDuration ?? undefined };
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
