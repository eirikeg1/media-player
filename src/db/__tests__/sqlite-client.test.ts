/**
 * Tests for the shared SQLite connection: one connection per process, and
 * serialized access so a transaction can never be interleaved with anything
 * else. The fake is backed by real SQLite, so a nested `BEGIN` or a statement
 * landing inside someone else's transaction would fail loudly here.
 */
import {
  INIT_PRAGMAS,
  executeQuerySingle,
  executeStatement,
  executeTransaction,
  getDatabase,
} from '@/db/sqlite-client';
import type { SQLiteDatabase } from '@/test/fakes/expo-sqlite-fake';
import { flushAsync, resetTestDatabases } from '@/test/helpers';

const NOW = '2026-01-01T00:00:00.000Z';

async function insertUser(id: string): Promise<void> {
  await executeStatement(
    'INSERT INTO users (id, username, createdAt, updatedAt) VALUES (?, ?, ?, ?)',
    [id, id, NOW, NOW],
  );
}

async function countUsers(): Promise<number> {
  const row = await executeQuerySingle<{ count: number }>('SELECT COUNT(*) as count FROM users');
  return row?.count ?? 0;
}

beforeEach(async () => {
  await resetTestDatabases();
  // Open before each test so the ordering assertions below are not measuring
  // the one-off open.
  await getDatabase();
});

describe('getDatabase', () => {
  it('hands every caller the same connection', async () => {
    const [first, second] = await Promise.all([getDatabase(), getDatabase()]);
    expect(first).toBe(second);
  });

  it('applies the connection pragmas to the connection it hands out', async () => {
    // Asserted as "the statements ran", not as their effect: better-sqlite3
    // already enables foreign keys by default, so reading the pragma back would
    // pass even if the app never applied anything.
    const database = (await getDatabase()) as unknown as SQLiteDatabase;

    expect(database.__execLog()).toContain(INIT_PRAGMAS);
    for (const pragma of ['journal_mode = WAL', 'busy_timeout = 5000', 'foreign_keys = ON']) {
      expect(INIT_PRAGMAS).toContain(pragma);
    }
  });
});

describe('serialized access', () => {
  it('runs a transaction on the shared connection rather than a second one', async () => {
    const database = await getDatabase();
    const handles: unknown[] = [];

    await executeTransaction(async (tx) => {
      handles.push(tx);
      await tx.runAsync('INSERT INTO users (id, username, createdAt, updatedAt) VALUES (?,?,?,?)', [
        'user-1',
        'Alice',
        NOW,
        NOW,
      ]);
    });

    // A separate connection would miss the pragmas applied on open and sit
    // outside the lock that serialises everything else.
    expect(handles).toEqual([database]);
    await expect(countUsers()).resolves.toBe(1);
  });

  it('runs concurrent transactions one after another', async () => {
    const order: string[] = [];

    await Promise.all([
      executeTransaction(async (tx) => {
        order.push('first:start');
        await flushAsync(3); // yield: a second BEGIN here would abort the first
        await tx.runAsync(
          'INSERT INTO users (id, username, createdAt, updatedAt) VALUES (?, ?, ?, ?)',
          ['user-1', 'Alice', NOW, NOW],
        );
        order.push('first:end');
      }),
      executeTransaction(async (tx) => {
        order.push('second:start');
        await tx.runAsync(
          'INSERT INTO users (id, username, createdAt, updatedAt) VALUES (?, ?, ?, ?)',
          ['user-2', 'Bob', NOW, NOW],
        );
        order.push('second:end');
      }),
    ]);

    expect(order).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
    await expect(countUsers()).resolves.toBe(2);
  });

  it('makes a statement issued during a transaction wait for it', async () => {
    const order: string[] = [];

    const transaction = executeTransaction(async (tx) => {
      order.push('transaction:start');
      await tx.runAsync(
        'INSERT INTO users (id, username, createdAt, updatedAt) VALUES (?, ?, ?, ?)',
        ['user-1', 'Alice', NOW, NOW],
      );
      await flushAsync(3);
      order.push('transaction:end');
    });
    const query = countUsers().then((count) => order.push(`query:${count}`));

    await Promise.all([transaction, query]);

    // The query ran after the commit, so it sees the inserted row.
    expect(order).toEqual(['transaction:start', 'transaction:end', 'query:1']);
  });

  it('releases the lock when a transaction rolls back', async () => {
    await insertUser('user-1');

    await expect(
      executeTransaction(async (tx) => {
        await tx.runAsync('DELETE FROM users');
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    // The rollback undid the delete, and the queue is still usable.
    await expect(countUsers()).resolves.toBe(1);
    await insertUser('user-2');
    await expect(countUsers()).resolves.toBe(2);
  });
});
