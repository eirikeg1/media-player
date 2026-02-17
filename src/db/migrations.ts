import * as SQLite from 'expo-sqlite';
import { getDatabase } from './sqlite-client';

interface Migration {
  version: number;
  name: string;
  up: (db: SQLite.SQLiteDatabase) => Promise<void>;
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
      // Check if activePlaylistId column exists, if not add it
      try {
        await db.execAsync(`
          ALTER TABLE user_settings ADD COLUMN activePlaylistId TEXT;
        `);
        console.log('[Migration] Added activePlaylistId column to user_settings table');
      } catch (error) {
        // Column might already exist, check the error
        if (error instanceof Error && error.message.includes('duplicate column name')) {
          console.log('[Migration] activePlaylistId column already exists');
        } else {
          // If it's a different error, re-throw it
          throw error;
        }
      }
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
      await db.execAsync(`
        ALTER TABLE user_settings ADD COLUMN showHomeTab INTEGER NOT NULL DEFAULT 1;
      `);
      await db.execAsync(`
        ALTER TABLE user_settings ADD COLUMN showLiveTab INTEGER NOT NULL DEFAULT 1;
      `);
      await db.execAsync(`
        ALTER TABLE user_settings ADD COLUMN showVideosTab INTEGER NOT NULL DEFAULT 1;
      `);

      console.log('[Migration] Added tab visibility columns to user_settings');
    },
  },
  {
    version: 8,
    name: 'add_playlist_sharing',
    up: async (db) => {
      await db.execAsync(`
        ALTER TABLE playlists ADD COLUMN createdByUserId TEXT;
      `);
      await db.execAsync(`
        ALTER TABLE user_settings ADD COLUMN playlistSharingEnabled INTEGER NOT NULL DEFAULT 1;
      `);

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
      await db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_cws_resume
        ON channel_watch_stats (userId, playlistId, lastWatchedAt DESC)
        WHERE lastPosition > 0 AND (totalDuration IS NULL OR lastPosition < totalDuration * 0.9);
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
      await db.execAsync(`ALTER TABLE user_settings ADD COLUMN privateModeExpiresAt TEXT;`);

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
      await db.execAsync(
        'ALTER TABLE user_settings ADD COLUMN shareUploadedBackgrounds INTEGER NOT NULL DEFAULT 1;',
      );

      console.log('[Migration] Added header background tables and shareUploadedBackgrounds setting');
    },
  },
];

/**
 * Get the current database version
 */
async function getCurrentVersion(db: SQLite.SQLiteDatabase): Promise<number> {
  try {
    const result = await db.getFirstAsync(
      'SELECT MAX(version) as version FROM migrations'
    ) as { version: number } | null;
    return result?.version || 0;
  } catch {
    // migrations table doesn't exist yet
    return 0;
  }
}

/**
 * Run all pending migrations
 */
export async function runMigrations(): Promise<void> {
  const db = await getDatabase();
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
