import * as SQLite from 'expo-sqlite';

const DB_NAME = 'iptv.db';

/**
 * Pragmas applied to the shared connection right after opening.
 *
 * Every statement the app runs goes through this one connection (see
 * `withDbLock`), so these settings apply to all of them.
 *
 * - `journal_mode = WAL` is persisted in the database file itself.
 * - `busy_timeout` only matters if something outside this module ever opens
 *   `iptv.db`; the lock below is what actually serialises app access.
 * - `foreign_keys` enforces the `users` cascades declared in the schema. All
 *   remaining foreign keys point at `users` (migration 18 dropped the legacy
 *   ones into `channels`), and `deleteUser` still deletes dependent rows
 *   explicitly, so enforcement only adds a safety net.
 *
 * Exported so a test can assert the connection really ran them: several are
 * indistinguishable from a driver default once the connection is open.
 */
export const INIT_PRAGMAS = `
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
  PRAGMA foreign_keys = ON;
`;

// The in-flight open *promise* is cached, not the resolved database: concurrent
// first callers (every startup hook fires at once) then share a single
// connection instead of each opening its own. A failed open clears the cache so
// a later call can retry instead of being stuck on a rejection.
let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

// Tail of the access queue. Everything touching the database chains onto it, so
// statements can never interleave with a transaction and two transactions can
// never nest. `withDbLock` keeps the tail rejection-free.
let lockTail: Promise<void> = Promise.resolve();

async function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  const database = await SQLite.openDatabaseAsync(DB_NAME);
  await database.execAsync(INIT_PRAGMAS);
  return database;
}

/**
 * Get the shared SQLite database connection, opening it on first use.
 */
export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = openDatabase().catch((error) => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}

/**
 * Run `operation` with exclusive access to the database.
 *
 * Operations run in call order, one at a time. A callback passed here must not
 * call `executeQuery`/`executeStatement`/`executeQuerySingle`/
 * `executeTransaction` — those take the same lock and would deadlock. Use the
 * database (or transaction) handle directly instead.
 */
export function withDbLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = lockTail.then(operation);
  lockTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/**
 * Run `operation` against the shared connection, holding the lock.
 *
 * The connection is resolved *inside* the lock, so work that queued behind a
 * `closeDatabase` gets the connection that is open when its turn comes rather
 * than the one that was closed while it waited.
 */
function withDatabase<T>(operation: (database: SQLite.SQLiteDatabase) => Promise<T>): Promise<T> {
  return withDbLock(async () => operation(await getDatabase()));
}

/**
 * Execute a SQL query that returns results
 */
export async function executeQuery<T = any>(
  query: string,
  params: any[] = []
): Promise<T[]> {
  return withDatabase((database) => database.getAllAsync<T>(query, params));
}

/**
 * Execute a SQL statement that doesn't return results (INSERT, UPDATE, DELETE)
 */
export async function executeStatement(
  query: string,
  params: any[] = []
): Promise<SQLite.SQLiteRunResult> {
  return withDatabase((database) => database.runAsync(query, params));
}

/**
 * Execute a single row query
 */
export async function executeQuerySingle<T = any>(
  query: string,
  params: any[] = []
): Promise<T | null> {
  return withDatabase((database) => database.getFirstAsync<T>(query, params));
}

/**
 * Execute multiple SQL statements in a transaction.
 *
 * The callback receives the shared connection and must run every statement on
 * it (`runAsync`/`getAllAsync`/`getFirstAsync`/`execAsync`). Calling the
 * `execute*` helpers from inside the callback deadlocks: they queue behind the
 * transaction that is waiting on them.
 *
 * Deliberately `withTransactionAsync` rather than `withExclusiveTransactionAsync`:
 * the latter opens a second connection, which would miss {@link INIT_PRAGMAS}
 * and sit outside the lock that serialises everything else.
 */
export async function executeTransaction(
  callback: (transaction: SQLite.SQLiteDatabase) => Promise<void>
): Promise<void> {
  await withDatabase((database) => database.withTransactionAsync(() => callback(database)));
}

/**
 * Close the database connection, waiting for in-flight work to finish.
 */
export async function closeDatabase(): Promise<void> {
  const pending = databasePromise;
  databasePromise = null;
  if (!pending) return;

  await withDbLock(async () => {
    const database = await pending;
    await database.closeAsync();
  });
}
