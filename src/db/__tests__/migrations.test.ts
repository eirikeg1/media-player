/**
 * Migration tests: schema completeness, migration bookkeeping, and idempotency.
 * resetTestDatabases() runs all migrations against a fresh in-memory database.
 */
import { addColumnIfMissing, runMigrations } from '@/db/migrations';
import { COMPLETION_RATIO } from '@/lib/viewing-progress';
import { executeQuery, executeStatement, getDatabase } from '@/db/sqlite-client';
import { resetTestDatabases } from '@/test/helpers';

/**
 * Every schema migration version, in order. 22 is not among them: it belongs
 * to the deferred channel-id remap (see the test below).
 */
const SCHEMA_VERSIONS = [...Array.from({ length: 21 }, (_, i) => i + 1), 23, 24];
const LATEST_NAME = 'add_background_sync_on_mobile_data';

const EXPECTED_TABLES = [
  'migrations',
  'playlists',
  'channels',
  'users',
  'user_settings',
  'user_favorite_channels',
  'user_hidden_channels',
  'user_channel_order',
  'user_favorite_groups',
  'viewing_sessions',
  'channel_watch_stats',
  'group_watch_stats',
  'user_uploaded_backgrounds',
  'user_header_selections',
  'user_content_reactions',
];

interface MigrationRow {
  version: number;
  name: string;
  appliedAt: string;
}

async function getTableNames(): Promise<string[]> {
  const rows = await executeQuery<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
  );
  return rows.map((row) => row.name);
}

async function getMigrationRows(): Promise<MigrationRow[]> {
  return executeQuery<MigrationRow>('SELECT * FROM migrations ORDER BY version ASC');
}

beforeEach(async () => {
  await resetTestDatabases();
});

describe('runMigrations', () => {
  it('creates all expected tables', async () => {
    const tables = await getTableNames();
    expect(tables).toEqual(expect.arrayContaining(EXPECTED_TABLES));
  });

  it('builds the resume index around the shared completion ratio', async () => {
    const [index] = await executeQuery<{ sql: string }>(
      "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_cws_resume'",
    );

    // The repository's "in progress" queries inline the same constant, and
    // SQLite only reaches for a partial index when the query's condition
    // provably implies the index's own — two different literals would quietly
    // cost every continue-watching query a full table scan.
    expect(index.sql).toContain(`totalDuration * ${COMPLETION_RATIO}`);
  });

  it('drops the legacy watch-history tables replaced in migration 9', async () => {
    const tables = await getTableNames();
    expect(tables).not.toContain('user_watch_history');
    expect(tables).not.toContain('user_playback_position');
  });

  it('records every migration version in order', async () => {
    const rows = await getMigrationRows();

    expect(rows.map((row) => row.version)).toEqual(SCHEMA_VERSIONS);
    expect(rows[0].name).toBe('initial_schema');
    expect(rows[rows.length - 1].name).toBe(LATEST_NAME);

    for (const row of rows) {
      expect(row.name).toBeTruthy();
      expect(Number.isNaN(Date.parse(row.appliedAt))).toBe(false);
    }
  });

  it('leaves version 22 to the deferred channel-id remap', async () => {
    // `migrateLegacyChannelIds` runs from the boot sequence, not from this
    // list, and records itself as version 22. A schema migration claiming that
    // number would collide with it on any device that has already migrated.
    const rows = await getMigrationRows();

    expect(rows.map((row) => row.version)).not.toContain(22);
  });

  it('adds the columns introduced by later playlist migrations', async () => {
    const columns = await executeQuery<{ name: string }>('PRAGMA table_info(playlists)');
    const names = columns.map((column) => column.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'epgUrl',
        'syncInterval',
        'epgSyncInterval',
        'lastEpgFetchedAt',
        'createdByUserId',
      ]),
    );
  });

  it('adds the background mobile-data switch, off for existing users (migration 24)', async () => {
    const columns = await executeQuery<{ name: string; dflt_value: string | null }>(
      'PRAGMA table_info(user_settings)',
    );
    const column = columns.find((c) => c.name === 'backgroundSyncOnMobileData');
    expect(column?.dflt_value).toBe('0');
  });

  describe('backfilling unset sync intervals (migration 23)', () => {
    async function insertPlaylist(
      id: string,
      syncInterval: number | null,
      epgSyncInterval: number | null,
    ): Promise<void> {
      const now = '2026-01-01T00:00:00.000Z';
      await executeStatement(
        `INSERT INTO playlists (id, name, url, syncInterval, epgSyncInterval, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, id, `https://iptv.example.com/${id}.m3u`, syncInterval, epgSyncInterval, now, now],
      );
    }

    async function intervals(id: string) {
      const [row] = await executeQuery<{ syncInterval: number | null; epgSyncInterval: number | null }>(
        'SELECT syncInterval, epgSyncInterval FROM playlists WHERE id = ?',
        [id],
      );
      return row;
    }

    it('fills NULL with the defaults and leaves Off and explicit values alone', async () => {
      await insertPlaylist('never-set', null, null);
      await insertPlaylist('off', 0, 0);
      await insertPlaylist('chosen', 60, 2880);
      await insertPlaylist('half-set', 120, null);

      // Rewind to just before migration 23 — the state of a device that last
      // ran the previous build — and migrate again.
      await executeStatement('DELETE FROM migrations WHERE version >= ?', [23]);
      await runMigrations();

      expect(await intervals('never-set')).toEqual({ syncInterval: 360, epgSyncInterval: 1440 });
      expect(await intervals('off')).toEqual({ syncInterval: 0, epgSyncInterval: 0 });
      expect(await intervals('chosen')).toEqual({ syncInterval: 60, epgSyncInterval: 2880 });
      expect(await intervals('half-set')).toEqual({ syncInterval: 120, epgSyncInterval: 1440 });
    });
  });

  it('keeps only the users foreign key on user channel tables (migration 18)', async () => {
    // channelId points into the Rust database now; a leftover FK to the legacy
    // channels table would break favoriting if FK enforcement is ever enabled.
    for (const table of ['user_favorite_channels', 'user_hidden_channels', 'user_channel_order']) {
      const foreignKeys = await executeQuery<{ table: string }>(
        `PRAGMA foreign_key_list(${table})`,
      );
      expect(foreignKeys.map((fk) => fk.table)).toEqual(['users']);
    }
  });

  it('creates the user_content_reactions table with the expected shape (migration 21)', async () => {
    const columns = await executeQuery<{ name: string }>(
      'PRAGMA table_info(user_content_reactions)',
    );
    expect(columns.map((column) => column.name)).toEqual([
      'id',
      'userId',
      'channelId',
      'reaction',
      'createdAt',
    ]);

    // channelId points into the Rust database; only the users FK may exist.
    const foreignKeys = await executeQuery<{ table: string }>(
      'PRAGMA foreign_key_list(user_content_reactions)',
    );
    expect(foreignKeys.map((fk) => fk.table)).toEqual(['users']);

    // The CHECK constraint only admits like (1) and dislike (-1).
    const now = '2026-01-01T00:00:00.000Z';
    await executeStatement(
      'INSERT INTO users (id, username, createdAt, updatedAt) VALUES (?, ?, ?, ?)',
      ['user-1', 'Alice', now, now],
    );
    const insertReaction = (id: string, reaction: number) =>
      executeStatement(
        `INSERT INTO user_content_reactions (id, userId, channelId, reaction, createdAt)
         VALUES (?, ?, ?, ?, ?)`,
        [id, 'user-1', 'ch-1', reaction, now],
      );
    await expect(insertReaction('r-invalid', 0)).rejects.toThrow();
    await expect(insertReaction('r-like', 1)).resolves.toBeDefined();
  });

  it('is a no-op when run a second time', async () => {
    const before = await getMigrationRows();

    await expect(runMigrations()).resolves.toBeUndefined();

    const after = await getMigrationRows();
    expect(after).toEqual(before);
    expect(after).toHaveLength(SCHEMA_VERSIONS.length);
  });
});

describe('addColumnIfMissing', () => {
  async function columnNames(table: string): Promise<string[]> {
    const columns = await executeQuery<{ name: string }>(`PRAGMA table_info(${table})`);
    return columns.map((column) => column.name);
  }

  it('adds a column that is not there yet', async () => {
    const db = await getDatabase();

    await addColumnIfMissing(db, 'user_settings', 'experimentalFlag', 'INTEGER NOT NULL DEFAULT 0');

    expect(await columnNames('user_settings')).toContain('experimentalFlag');
  });

  it('is a no-op for a column that already exists', async () => {
    // The state a retried migration finds: the ADD COLUMN landed but the
    // `migrations` row did not, so the DDL runs a second time.
    const db = await getDatabase();
    const before = await columnNames('user_settings');
    expect(before).toContain('showHomeTab');

    await expect(
      addColumnIfMissing(db, 'user_settings', 'showHomeTab', 'INTEGER NOT NULL DEFAULT 1'),
    ).resolves.toBeUndefined();

    expect(await columnNames('user_settings')).toEqual(before);
  });

  it('re-running a migration that already added its column succeeds', async () => {
    // Rewind the bookkeeping from migration 19 (sportsLeagueOrder /
    // sportsHideOtherLeagues) on, without touching the schema — the state a
    // torn run leaves behind — then migrate again: the guarded ADD COLUMNs must
    // not throw over the columns that are already there.
    await executeStatement('DELETE FROM migrations WHERE version >= ?', [19]);

    await expect(runMigrations()).resolves.toBeUndefined();

    const columns = await columnNames('user_settings');
    expect(columns).toEqual(expect.arrayContaining(['sportsLeagueOrder', 'sportsHideOtherLeagues']));
    const rows = await getMigrationRows();
    expect(rows).toHaveLength(SCHEMA_VERSIONS.length);
  });
});
