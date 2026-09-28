import * as SQLite from 'expo-sqlite';
import { COMPLETION_RATIO } from '@/lib/viewing-progress';
import { getRustDatabase } from '@/services/rust-channel-service';
import { getDatabase, withDbLock } from './sqlite-client';

interface Migration {
  version: number;
  name: string;
  up: (db: SQLite.SQLiteDatabase) => Promise<void>;
}

/**
 * Add a column unless the table already has it.
 *
 * `ALTER TABLE … ADD COLUMN` throws on a column that already exists, which
 * bricks the app when a migration is retried after a torn run (the DDL landed
 * but the `migrations` row did not). Every ADD COLUMN migration goes through
 * here so re-running it is a no-op.
 *
 * @param ddl The column definition after the name, e.g. `INTEGER NOT NULL DEFAULT 1`.
 */
export async function addColumnIfMissing(
  db: SQLite.SQLiteDatabase,
  table: string,
  column: string,
  ddl: string,
): Promise<void> {
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);

  if (columns.some((existing) => existing.name === column)) {
    console.log(`[Migration] Column ${table}.${column} already exists`);
    return;
  }

  await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl};`);
}

const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: async (db) => {
      // Create playlists table
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS playlists (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          url TEXT NOT NULL,
          username TEXT,
          password TEXT,
          channelCount INTEGER,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL,
          lastFetchedAt TEXT
        );
      `);

      // Create channels table
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS channels (
          id TEXT PRIMARY KEY NOT NULL,
          playlistId TEXT NOT NULL,
          name TEXT NOT NULL,
          url TEXT NOT NULL,
          tvgId TEXT,
          tvgName TEXT,
          tvgLogo TEXT,
          tvgCountry TEXT,
          tvgLanguage TEXT,
          tvgUrl TEXT,
          groupTitle TEXT,
          httpReferrer TEXT,
          httpUserAgent TEXT,
          FOREIGN KEY (playlistId) REFERENCES playlists (id) ON DELETE CASCADE
        );
      `);

      // Create index on playlistId for faster queries
      await db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_channels_playlistId ON channels (playlistId);
      `);

      // Create migrations tracking table
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS migrations (
          version INTEGER PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          appliedAt TEXT NOT NULL
        );
      `);
    },
  },
  {
    version: 2,
    name: 'add_user_tables',
    up: async (db) => {
      // Create users table
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY NOT NULL,
          username TEXT NOT NULL,
          avatarUrl TEXT,
          isPrimary INTEGER NOT NULL DEFAULT 0,
          pin TEXT,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL,
          lastActiveAt TEXT
        );
      `);

      // Create user_settings table
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS user_settings (
          userId TEXT PRIMARY KEY NOT NULL,
          theme TEXT NOT NULL DEFAULT 'system',
          language TEXT NOT NULL DEFAULT 'en',
          defaultQuality TEXT NOT NULL DEFAULT 'auto',
          autoplay INTEGER NOT NULL DEFAULT 0,
          showChannelLogos INTEGER NOT NULL DEFAULT 1,
          viewMode TEXT NOT NULL DEFAULT 'grid',
          channelSortBy TEXT NOT NULL DEFAULT 'name',
          parentalControlEnabled INTEGER NOT NULL DEFAULT 0,
          parentalControlPin TEXT,
          FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE
        );
      `);

      // Create user_favorite_channels table
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS user_favorite_channels (
          id TEXT PRIMARY KEY NOT NULL,
          userId TEXT NOT NULL,
          channelId TEXT NOT NULL,
          addedAt TEXT NOT NULL,
          FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE,
          FOREIGN KEY (channelId) REFERENCES channels (id) ON DELETE CASCADE,
          UNIQUE(userId, channelId)
        );
      `);

      // Create user_hidden_channels table
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS user_hidden_channels (
          id TEXT PRIMARY KEY NOT NULL,
          userId TEXT NOT NULL,
          channelId TEXT NOT NULL,
          hiddenAt TEXT NOT NULL,
          FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE,
          FOREIGN KEY (channelId) REFERENCES channels (id) ON DELETE CASCADE,
          UNIQUE(userId, channelId)
        );
      `);

      // Create user_channel_order table
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS user_channel_order (
          id TEXT PRIMARY KEY NOT NULL,
          userId TEXT NOT NULL,
          channelId TEXT NOT NULL,
          sortOrder INTEGER NOT NULL,
          FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE,
          FOREIGN KEY (channelId) REFERENCES channels (id) ON DELETE CASCADE,
          UNIQUE(userId, channelId)
        );
      `);

      // Create user_watch_history table
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS user_watch_history (
          id TEXT PRIMARY KEY NOT NULL,
          userId TEXT NOT NULL,
          channelId TEXT NOT NULL,
          watchedAt TEXT NOT NULL,
          duration INTEGER NOT NULL,
          FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE,
          FOREIGN KEY (channelId) REFERENCES channels (id) ON DELETE CASCADE
        );
      `);

      // Create user_playback_position table
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS user_playback_position (
          id TEXT PRIMARY KEY NOT NULL,
          userId TEXT NOT NULL,
          channelId TEXT NOT NULL,
          position INTEGER NOT NULL,
          totalDuration INTEGER NOT NULL,
          updatedAt TEXT NOT NULL,
          FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE,
          FOREIGN KEY (channelId) REFERENCES channels (id) ON DELETE CASCADE,
          UNIQUE(userId, channelId)
        );
      `);

      // Create indexes for performance
      await db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_user_favorite_channels_userId ON user_favorite_channels (userId);
      `);
      await db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_user_hidden_channels_userId ON user_hidden_channels (userId);
      `);
      await db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_user_channel_order_userId ON user_channel_order (userId);
      `);
      await db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_user_watch_history_userId_watchedAt ON user_watch_history (userId, watchedAt);
      `);
      await db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_user_playback_position_userId ON user_playback_position (userId);
      `);
    },
  },
  {
    version: 3,
    name: 'remove_primary_user_concept',
    up: async (db) => {
      // SQLite doesn't support DROP COLUMN directly, so we need to recreate the table

      // Create new users table without isPrimary column
      await db.execAsync(`
        CREATE TABLE users_new (
          id TEXT PRIMARY KEY NOT NULL,
          username TEXT NOT NULL,
          avatarUrl TEXT,
          pin TEXT,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL,
          lastActiveAt TEXT
        );
      `);

      // Copy data from old table to new table (excluding isPrimary)
      await db.execAsync(`
        INSERT INTO users_new (id, username, avatarUrl, pin, createdAt, updatedAt, lastActiveAt)
        SELECT id, username, avatarUrl, pin, createdAt, updatedAt, lastActiveAt FROM users;
      `);

      // Drop old table
      await db.execAsync(`DROP TABLE users;`);

      // Rename new table to original name
      await db.execAsync(`ALTER TABLE users_new RENAME TO users;`);

      console.log('[Migration] Removed isPrimary column from users table');
    },
  },
  {
    version: 4,
    name: 'update_user_settings_remove_inappropriate_fields',
    up: async (db) => {
      // SQLite doesn't support DROP COLUMN directly, so we need to recreate the table

      // Create new user_settings table without inappropriate fields and with new defaultSubtitles and activePlaylistId fields
      await db.execAsync(`
        CREATE TABLE user_settings_new (
          userId TEXT PRIMARY KEY NOT NULL,
          theme TEXT NOT NULL DEFAULT 'system',
          language TEXT NOT NULL DEFAULT 'en',
          defaultQuality TEXT NOT NULL DEFAULT 'auto',
          defaultSubtitles TEXT NOT NULL DEFAULT 'off',
          activePlaylistId TEXT,
          channelSortBy TEXT NOT NULL DEFAULT 'name',
          parentalControlEnabled INTEGER NOT NULL DEFAULT 0,
          parentalControlPin TEXT,
          FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE
        );
      `);

      // Copy data from old table to new table (excluding removed fields)
      await db.execAsync(`
        INSERT INTO user_settings_new (userId, theme, language, defaultQuality, defaultSubtitles, activePlaylistId, channelSortBy, parentalControlEnabled, parentalControlPin)
        SELECT userId, theme, language, defaultQuality, 'off' as defaultSubtitles, NULL as activePlaylistId, channelSortBy, parentalControlEnabled, parentalControlPin
        FROM user_settings;
      `);

      // Drop old table
      await db.execAsync(`DROP TABLE user_settings;`);

      // Rename new table to original name
      await db.execAsync(`ALTER TABLE user_settings_new RENAME TO user_settings;`);

      console.log('[Migration] Updated user_settings table - removed autoplay, showChannelLogos, viewMode and added defaultSubtitles');
    },
  },
  {
    version: 5,
    name: 'add_activePlaylistId_if_missing',
    up: async (db) => {
      // Fresh installs always reach this with the column already present
      // (migration 4 creates it).
      await addColumnIfMissing(db, 'user_settings', 'activePlaylistId', 'TEXT');
      console.log('[Migration] Ensured activePlaylistId column on user_settings');
    },
  },
  {
    version: 6,
    name: 'add_user_favorite_groups',
    up: async (db) => {
      // Create user_favorite_groups table
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS user_favorite_groups (
          id TEXT PRIMARY KEY NOT NULL,
          userId TEXT NOT NULL,
          groupName TEXT NOT NULL,
          addedAt TEXT NOT NULL,
          FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE,
          UNIQUE(userId, groupName)
        );
      `);

      // Create index for performance
      await db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_user_favorite_groups_userId ON user_favorite_groups (userId);
      `);

      console.log('[Migration] Added user_favorite_groups table');
    },
  },
  {
    version: 7,
    name: 'add_tab_visibility_settings',
    up: async (db) => {
      await addColumnIfMissing(db, 'user_settings', 'showHomeTab', 'INTEGER NOT NULL DEFAULT 1');
      await addColumnIfMissing(db, 'user_settings', 'showLiveTab', 'INTEGER NOT NULL DEFAULT 1');
      await addColumnIfMissing(db, 'user_settings', 'showVideosTab', 'INTEGER NOT NULL DEFAULT 1');

      console.log('[Migration] Added tab visibility columns to user_settings');
    },
  },
  {
    version: 8,
    name: 'add_playlist_sharing',
    up: async (db) => {
      await addColumnIfMissing(db, 'playlists', 'createdByUserId', 'TEXT');
      await addColumnIfMissing(
        db,
        'user_settings',
        'playlistSharingEnabled',
        'INTEGER NOT NULL DEFAULT 1',
      );

      console.log('[Migration] Added playlist sharing columns');
    },
  },
  {
    version: 9,
    name: 'add_viewing_history_tables',
    up: async (db) => {
      // Drop unused old tables
      await db.execAsync(`DROP TABLE IF EXISTS user_watch_history;`);
      await db.execAsync(`DROP TABLE IF EXISTS user_playback_position;`);

      // Create viewing_sessions table (raw event log)
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS viewing_sessions (
          id TEXT PRIMARY KEY NOT NULL,
          userId TEXT NOT NULL,
          playlistId TEXT NOT NULL,
          channelId TEXT NOT NULL,
          channelName TEXT NOT NULL,
          groupTitle TEXT,
          contentType TEXT NOT NULL,
          tvgLogo TEXT,
          startedAt TEXT NOT NULL,
          endedAt TEXT,
          durationWatched REAL DEFAULT 0,
          startPosition REAL DEFAULT 0,
          endPosition REAL DEFAULT 0,
          totalDuration REAL,
          dayOfWeek INTEGER,
          hourOfDay INTEGER,
          completed INTEGER DEFAULT 0,
          FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE
        );
      `);

      // Indexes for viewing_sessions
      await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_vs_user_playlist ON viewing_sessions (userId, playlistId);`);
      await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_vs_user_started ON viewing_sessions (userId, startedAt DESC);`);
      await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_vs_user_content ON viewing_sessions (userId, contentType, startedAt DESC);`);
      await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_vs_user_group ON viewing_sessions (userId, groupTitle, startedAt DESC);`);
      await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_vs_user_time_pattern ON viewing_sessions (userId, dayOfWeek, hourOfDay);`);

      // Create channel_watch_stats table (aggregated per user+playlist+channel)
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS channel_watch_stats (
          userId TEXT NOT NULL,
          playlistId TEXT NOT NULL,
          channelId TEXT NOT NULL,
          channelName TEXT NOT NULL,
          groupTitle TEXT,
          contentType TEXT NOT NULL,
          tvgLogo TEXT,
          watchCount INTEGER DEFAULT 0,
          totalTimeWatched REAL DEFAULT 0,
          lastWatchedAt TEXT NOT NULL,
          firstWatchedAt TEXT NOT NULL,
          lastPosition REAL DEFAULT 0,
          totalDuration REAL,
          completionCount INTEGER DEFAULT 0,
          avgSessionDuration REAL DEFAULT 0,
          longestSessionDuration REAL DEFAULT 0,
          PRIMARY KEY (userId, playlistId, channelId),
          FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE
        );
      `);

      // Indexes for channel_watch_stats
      await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_cws_last_watched ON channel_watch_stats (userId, playlistId, lastWatchedAt DESC);`);
      await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_cws_watch_count ON channel_watch_stats (userId, playlistId, watchCount DESC);`);
      await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_cws_total_time ON channel_watch_stats (userId, playlistId, totalTimeWatched DESC);`);
      // The ratio comes from the shared constant so this predicate and the
      // "in progress" queries in the repository cannot drift into two different
      // numbers — SQLite only uses a partial index when the query's condition
      // provably implies the index's own, which a differing literal would break.
      await db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_cws_resume
        ON channel_watch_stats (userId, playlistId, lastWatchedAt DESC)
        WHERE lastPosition > 0 AND (totalDuration IS NULL OR lastPosition < totalDuration * ${COMPLETION_RATIO});
      `);

      // Create group_watch_stats table (aggregated per user+playlist+group)
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS group_watch_stats (
          userId TEXT NOT NULL,
          playlistId TEXT NOT NULL,
          groupTitle TEXT NOT NULL,
          watchCount INTEGER DEFAULT 0,
          totalTimeWatched REAL DEFAULT 0,
          uniqueChannelsWatched INTEGER DEFAULT 0,
          lastWatchedAt TEXT NOT NULL,
          PRIMARY KEY (userId, playlistId, groupTitle),
          FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE
        );
      `);

      console.log('[Migration] Added viewing history tables (viewing_sessions, channel_watch_stats, group_watch_stats)');
    },
  },
  {
    version: 10,
    name: 'add_private_mode_expires_at',
    up: async (db) => {
      await addColumnIfMissing(db, 'user_settings', 'privateModeExpiresAt', 'TEXT');

      console.log('[Migration] Added privateModeExpiresAt column to user_settings');
    },
  },
  {
    version: 11,
    name: 'add_header_background_tables',
    up: async (db) => {
      // Pool of uploaded background images
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS user_uploaded_backgrounds (
          id TEXT PRIMARY KEY NOT NULL,
          userId TEXT NOT NULL,
          pageId TEXT NOT NULL,
          fileUri TEXT NOT NULL,
          createdAt TEXT NOT NULL,
          FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE
        );
      `);
      await db.execAsync(
        'CREATE INDEX IF NOT EXISTS idx_uub_userId ON user_uploaded_backgrounds (userId);',
      );
      await db.execAsync(
        'CREATE INDEX IF NOT EXISTS idx_uub_userId_pageId ON user_uploaded_backgrounds (userId, pageId);',
      );

      // Current header selection per user per page
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS user_header_selections (
          userId TEXT NOT NULL,
          pageId TEXT NOT NULL,
          type TEXT NOT NULL,
          value TEXT NOT NULL,
          updatedAt TEXT NOT NULL,
          PRIMARY KEY (userId, pageId),
          FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE
        );
      `);

      // Share-uploads toggle on user_settings
      await addColumnIfMissing(
        db,
        'user_settings',
        'shareUploadedBackgrounds',
        'INTEGER NOT NULL DEFAULT 1',
      );

      console.log('[Migration] Added header background tables and shareUploadedBackgrounds setting');
    },
  },
  {
    version: 12,
    name: 'add_playlist_epg_url',
    up: async (db) => {
      await addColumnIfMissing(db, 'playlists', 'epgUrl', 'TEXT');

      console.log('[Migration] Added epgUrl column to playlists');
    },
  },
  {
    version: 13,
    name: 'add_next_episode_columns',
    up: async (db) => {
      await addColumnIfMissing(db, 'channel_watch_stats', 'nextEpisodeChannelId', 'TEXT');
      await addColumnIfMissing(db, 'channel_watch_stats', 'nextEpisodeChannelName', 'TEXT');

      console.log('[Migration] Added next-episode columns to channel_watch_stats');
    },
  },
  {
    version: 14,
    name: 'add_playlist_sync_interval',
    up: async (db) => {
      await addColumnIfMissing(db, 'playlists', 'syncInterval', 'INTEGER');

      console.log('[Migration] Added syncInterval column to playlists');
    },
  },
  {
    version: 15,
    name: 'add_show_sports_tab',
    up: async (db) => {
      await addColumnIfMissing(db, 'user_settings', 'showSportsTab', 'INTEGER NOT NULL DEFAULT 1');

      console.log('[Migration] Added showSportsTab column to user_settings');
    },
  },
  {
    version: 16,
    name: 'add_playlist_epg_sync',
    up: async (db) => {
      await addColumnIfMissing(db, 'playlists', 'epgSyncInterval', 'INTEGER');
      await addColumnIfMissing(db, 'playlists', 'lastEpgFetchedAt', 'TEXT');

      console.log('[Migration] Added epgSyncInterval and lastEpgFetchedAt columns to playlists');
    },
  },
  {
    version: 17,
    name: 'add_sports_country',
    up: async (db) => {
      await addColumnIfMissing(db, 'user_settings', 'sportsCountry', 'TEXT');

      console.log('[Migration] Added sportsCountry column to user_settings');
    },
  },
  {
    version: 18,
    name: 'drop_legacy_channel_foreign_keys',
    up: async (db) => {
      // Channels moved to the Rust database (channels.db); channelId values no
      // longer reference the legacy channels table in this database. The old
      // FOREIGN KEY constraints are inert while PRAGMA foreign_keys is off,
      // but would break favoriting/hiding the moment enforcement is enabled.
      // SQLite can't drop a constraint, so rebuild the three tables keeping
      // only the users FK. Orphaned rows are purged instead of copied along:
      // deleteUser used to rely on the inert cascades, so deleted users left
      // their favorites/hidden/order rows behind.
      const tables = [
        { name: 'user_favorite_channels', extraColumn: 'addedAt TEXT NOT NULL' },
        { name: 'user_hidden_channels', extraColumn: 'hiddenAt TEXT NOT NULL' },
        { name: 'user_channel_order', extraColumn: 'sortOrder INTEGER NOT NULL' },
      ];

      for (const { name, extraColumn } of tables) {
        const columnName = extraColumn.split(' ')[0];

        await db.execAsync(`
          DELETE FROM ${name} WHERE userId NOT IN (SELECT id FROM users);
        `);
        await db.execAsync(`
          CREATE TABLE ${name}_new (
            id TEXT PRIMARY KEY NOT NULL,
            userId TEXT NOT NULL,
            channelId TEXT NOT NULL,
            ${extraColumn},
            FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE,
            UNIQUE(userId, channelId)
          );
        `);
        await db.execAsync(`
          INSERT INTO ${name}_new (id, userId, channelId, ${columnName})
          SELECT id, userId, channelId, ${columnName} FROM ${name};
        `);
        await db.execAsync(`DROP TABLE ${name};`);
        await db.execAsync(`ALTER TABLE ${name}_new RENAME TO ${name};`);
        await db.execAsync(`
          CREATE INDEX IF NOT EXISTS idx_${name}_userId ON ${name} (userId);
        `);
      }

      console.log('[Migration] Dropped legacy channels-table foreign keys and purged orphaned rows');
    },
  },
  {
    version: 19,
    name: 'add_sports_league_preferences',
    up: async (db) => {
      await addColumnIfMissing(db, 'user_settings', 'sportsLeagueOrder', 'TEXT');
      await addColumnIfMissing(
        db,
        'user_settings',
        'sportsHideOtherLeagues',
        'INTEGER NOT NULL DEFAULT 0',
      );

      console.log('[Migration] Added sportsLeagueOrder and sportsHideOtherLeagues columns to user_settings');
    },
  },
  {
    version: 20,
    name: 'add_sports_background_refresh',
    up: async (db) => {
      await addColumnIfMissing(db, 'user_settings', 'sportsBackgroundRefresh', 'TEXT');

      console.log('[Migration] Added sportsBackgroundRefresh column to user_settings');
    },
  },
  {
    version: 21,
    name: 'add_user_content_reactions',
    up: async (db) => {
      // Like/dislike reactions on movies and series. One row per
      // (user, content): the UNIQUE constraint makes like/dislike mutually
      // exclusive. channelId follows the favorites convention (channel id for
      // movies, `series:`-prefixed id for series) and intentionally has no
      // foreign key — the catalog lives in the Rust database.
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS user_content_reactions (
          id TEXT PRIMARY KEY NOT NULL,
          userId TEXT NOT NULL,
          channelId TEXT NOT NULL,
          reaction INTEGER NOT NULL CHECK (reaction IN (1, -1)),
          createdAt TEXT NOT NULL,
          FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE,
          UNIQUE(userId, channelId)
        );
      `);
      await db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_user_content_reactions_userId ON user_content_reactions (userId);
      `);

      console.log('[Migration] Created user_content_reactions table');
    },
  },
];

/**
 * Get the current database version.
 *
 * A fresh database is recognised by the absence of the `migrations` table, not
 * by the error message of a failed SELECT: corruption or an unreadable file
 * must not be read as "fresh", which would re-run every migration over
 * existing data.
 */
async function getCurrentVersion(db: SQLite.SQLiteDatabase): Promise<number> {
  const migrationsTable = await db.getFirstAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'migrations'"
  );
  if (!migrationsTable) {
    return 0;
  }

  const result = await db.getFirstAsync<{ version: number | null }>(
    'SELECT MAX(version) as version FROM migrations'
  );
  return result?.version ?? 0;
}

async function applyPendingMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  const currentVersion = await getCurrentVersion(db);

  const pendingMigrations = migrations.filter(
    (m) => m.version > currentVersion
  );

  if (pendingMigrations.length === 0) {
    console.log('[DB] Database is up to date');
    return;
  }

  console.log(`[DB] Running ${pendingMigrations.length} migrations...`);

  for (const migration of pendingMigrations) {
    await db.withTransactionAsync(async () => {
      console.log(`[DB] Applying migration ${migration.version}: ${migration.name}`);
      await migration.up(db);

      // Record the migration
      await db.runAsync(
        'INSERT INTO migrations (version, name, appliedAt) VALUES (?, ?, ?)',
        [migration.version, migration.name, new Date().toISOString()]
      );
    });
  }

  console.log('[DB] All migrations completed successfully');
}

// Single-flight guard, tied to the connection it ran against: concurrent
// callers share one run, and a new connection (after `closeDatabase`) migrates
// again. A failed run is forgotten so a retry can start over.
let migrationRun: { db: SQLite.SQLiteDatabase; promise: Promise<void> } | null = null;

/**
 * Run all pending migrations. Concurrent calls share a single run, and the
 * whole run holds the database lock so no query can observe a half-migrated
 * schema.
 */
export async function runMigrations(): Promise<void> {
  const db = await getDatabase();

  if (migrationRun?.db === db) {
    return migrationRun.promise;
  }

  const promise = withDbLock(() => applyPendingMigrations(db));
  migrationRun = { db, promise };

  try {
    await promise;
  } catch (error) {
    migrationRun = null;
    throw error;
  }
}

/**
 * Initialize the database by running all migrations
 */
export async function initializeDatabase(): Promise<void> {
  try {
    await runMigrations();
  } catch (error) {
    console.error('[DB] Error initializing database:', error);
    throw error;
  }
}

/**
 * The one-time remap of legacy `"{title}|{url}"` channel ids onto the ids the
 * backend generates today (`movie:12345`, `episode:678`, `live:42`).
 *
 * Not part of {@link migrations}: it needs the Rust database to be open (the
 * mapping is a native call), which happens after the schema migrations. It is
 * recorded in the same `migrations` table so it runs exactly once, which speaks
 * for this version number: the next schema migration takes 23.
 */
const LEGACY_CHANNEL_ID_REMAP = { version: 22, name: 'remap_legacy_channel_ids' } as const;

/**
 * Every column in this database that holds a channel id, and the column that
 * scopes it to a playlist where there is one.
 *
 * Grepped from the schema above; a new id-keyed column has to be added here, or
 * a device that has not migrated yet will leave it behind.
 */
const CHANNEL_ID_COLUMNS: { table: string; column: string; playlistColumn?: string }[] = [
  { table: 'channel_watch_stats', column: 'channelId', playlistColumn: 'playlistId' },
  { table: 'channel_watch_stats', column: 'nextEpisodeChannelId', playlistColumn: 'playlistId' },
  { table: 'viewing_sessions', column: 'channelId', playlistColumn: 'playlistId' },
  { table: 'user_favorite_channels', column: 'channelId' },
  { table: 'user_hidden_channels', column: 'channelId' },
  { table: 'user_channel_order', column: 'channelId' },
  { table: 'user_content_reactions', column: 'channelId' },
];

/**
 * Stored ids worth asking the backend about: only the legacy form carries the
 * `|` separator, so a `tvg.id` or an already-current id never crosses the
 * bridge. Live favourites are the bulk of these tables.
 */
const LEGACY_ID_PREDICATE = "LIKE '%|%'";

/**
 * The distinct legacy ids this playlist's rows are keyed on.
 *
 * Watch-stats ids come first, least recently watched first: two rows for the
 * same title (one per spelling the panel used) collapse onto one id, and the
 * `UPDATE OR REPLACE` below lets the last write win — so the row the user
 * watched most recently is the one that survives.
 */
async function collectLegacyChannelIds(
  db: SQLite.SQLiteDatabase,
  playlistId: string,
): Promise<string[]> {
  const ids = new Set<string>();

  const byRecency = await db.getAllAsync<{ id: string }>(
    `SELECT channelId AS id FROM channel_watch_stats
     WHERE playlistId = ? AND channelId ${LEGACY_ID_PREDICATE}
     GROUP BY channelId
     ORDER BY MAX(lastWatchedAt) ASC`,
    [playlistId],
  );
  for (const { id } of byRecency) ids.add(id);

  for (const { table, column, playlistColumn } of CHANNEL_ID_COLUMNS) {
    const scope = playlistColumn ? ` AND ${playlistColumn} = ?` : '';
    const rows = await db.getAllAsync<{ id: string }>(
      `SELECT DISTINCT ${column} AS id FROM ${table}
       WHERE ${column} ${LEGACY_ID_PREDICATE}${scope}`,
      playlistColumn ? [playlistId] : [],
    );
    for (const { id } of rows) ids.add(id);
  }

  return [...ids];
}

/**
 * Move this device's own data onto the stable channel ids.
 *
 * Channel ids used to be `"{title}|{url}"` for everything without a `tvg.id`,
 * so a panel rewriting a VOD title ("Wedding Crashers - 2005" → "Wedding
 * Crashers [PRE] [2005]") changed the id on the next playlist refresh and
 * orphaned the history, continue-watching position, favourite and reaction
 * keyed on it. The catalogue is rewritten first, then every table here follows,
 * per playlist and in one transaction. Ids with nothing to map to (plain M3U
 * playlists, which have no stream ids) are left exactly as they are.
 *
 * Runs once, guarded by its `migrations` row. Must be called after
 * {@link initializeDatabase}, because it needs the schema, and it opens the
 * Rust database, because the mapping rule lives there.
 */
export async function migrateLegacyChannelIds(): Promise<void> {
  const db = await getDatabase();

  await withDbLock(async () => {
    const applied = await db.getFirstAsync<{ version: number }>(
      'SELECT version FROM migrations WHERE version = ?',
      [LEGACY_CHANNEL_ID_REMAP.version],
    );
    if (applied) return;

    // With no playlist there is no catalogue to rewrite, and nothing an id
    // could be resolved against — but the run still counts as done.
    const playlists = await db.getAllAsync<{ id: string }>('SELECT id FROM playlists');
    if (playlists.length > 0) {
      const rustDb = await getRustDatabase();
      for (const { id } of playlists) {
        await remapPlaylistChannelIds(db, rustDb, id);
      }
    }

    await db.runAsync('INSERT INTO migrations (version, name, appliedAt) VALUES (?, ?, ?)', [
      LEGACY_CHANNEL_ID_REMAP.version,
      LEGACY_CHANNEL_ID_REMAP.name,
      new Date().toISOString(),
    ]);
  });
}

/** One playlist's share of {@link migrateLegacyChannelIds}. */
async function remapPlaylistChannelIds(
  db: SQLite.SQLiteDatabase,
  rustDb: Awaited<ReturnType<typeof getRustDatabase>>,
  playlistId: string,
): Promise<void> {
  const rewritten = await rustDb.rewritePlaylistChannelIds(playlistId);
  const legacyIds = await collectLegacyChannelIds(db, playlistId);
  const mappings = legacyIds.length
    ? await rustDb.mapLegacyChannelIds(playlistId, legacyIds)
    : [];

  let remapped = 0;
  await db.withTransactionAsync(async () => {
    for (const { table, column, playlistColumn } of CHANNEL_ID_COLUMNS) {
      const scope = playlistColumn ? ` AND ${playlistColumn} = ?` : '';
      for (const { legacyId, channelId } of mappings) {
        // OR REPLACE: two rows that differed only in the title now share one
        // id, and the unique constraints have to collapse them rather than
        // abort the whole remap.
        const result = await db.runAsync(
          `UPDATE OR REPLACE ${table} SET ${column} = ? WHERE ${column} = ?${scope}`,
          playlistColumn ? [channelId, legacyId, playlistId] : [channelId, legacyId],
        );
        remapped += result.changes;
      }
    }
  });

  console.log(
    `[Migration] Playlist ${playlistId}: ${rewritten} catalogue ids rewritten, ` +
      `${mappings.length}/${legacyIds.length} stored ids mapped, ${remapped} rows remapped`,
  );
}
