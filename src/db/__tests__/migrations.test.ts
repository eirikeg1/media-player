/**
 * Migration tests: schema completeness, migration bookkeeping, and idempotency.
 * resetTestDatabases() runs all migrations against a fresh in-memory database.
 */
import { runMigrations } from '@/db/migrations';
import { executeQuery } from '@/db/sqlite-client';
import { resetTestDatabases } from '@/test/helpers';

const LATEST_VERSION = 18;

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

  it('drops the legacy watch-history tables replaced in migration 9', async () => {
    const tables = await getTableNames();
    expect(tables).not.toContain('user_watch_history');
    expect(tables).not.toContain('user_playback_position');
  });

  it('records every migration version in order', async () => {
    const rows = await getMigrationRows();

    expect(rows).toHaveLength(LATEST_VERSION);
    expect(rows.map((row) => row.version)).toEqual(
      Array.from({ length: LATEST_VERSION }, (_, i) => i + 1),
    );
    expect(rows[0].name).toBe('initial_schema');
    expect(rows[LATEST_VERSION - 1].name).toBe('drop_legacy_channel_foreign_keys');

    for (const row of rows) {
      expect(row.name).toBeTruthy();
      expect(Number.isNaN(Date.parse(row.appliedAt))).toBe(false);
    }
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

  it('is a no-op when run a second time', async () => {
    const before = await getMigrationRows();

    await expect(runMigrations()).resolves.toBeUndefined();

    const after = await getMigrationRows();
    expect(after).toEqual(before);
    expect(after).toHaveLength(LATEST_VERSION);
  });
});
