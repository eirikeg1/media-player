/**
 * In-memory fake of `expo-sqlite`, backed by real SQLite (better-sqlite3).
 *
 * Repositories and migrations run their actual SQL against a real SQLite
 * engine instead of asserting on query strings, so schema mistakes, UPSERT
 * conflict clauses, and aggregation queries are genuinely exercised.
 *
 * Wired up automatically for every test via `__mocks__/expo-sqlite.ts`.
 * Each `openDatabaseAsync()` call returns a fresh `:memory:` database; the
 * app's `sqlite-client` caches the connection, so tests get a clean database
 * by calling `closeDatabase()` (see `src/test/helpers`).
 */
import BetterSqlite3 from 'better-sqlite3';

export interface SQLiteRunResult {
  lastInsertRowId: number;
  changes: number;
}

/** expo-sqlite binds booleans and undefined; better-sqlite3 does not. */
function normalizeParams(params: unknown[]): unknown[] {
  return params.map((p) => {
    if (p === undefined) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    return p;
  });
}

/**
 * better-sqlite3's native binding captures the SqliteError class of the FIRST
 * test file that loads it in a Jest worker process; later files in the same
 * worker receive errors from that earlier realm, which fail
 * `error instanceof Error` checks. Real expo-sqlite always throws realm-local
 * Errors, so every better-sqlite3 call goes through this rewrap.
 */
function rewrapRealmError(error: unknown): unknown {
  if (error instanceof Error) return error;
  const message = (error as { message?: unknown } | null)?.message;
  if (typeof message !== 'string') return error;
  const local = new Error(message);
  local.name = String((error as { name?: unknown }).name ?? 'SqliteError');
  return local;
}

export class SQLiteDatabase {
  private db: BetterSqlite3.Database;

  constructor() {
    this.db = new BetterSqlite3(':memory:');
  }

  /** Single funnel for better-sqlite3 calls — guarantees realm-local errors. */
  private run<T>(operation: () => T): T {
    try {
      return operation();
    } catch (error) {
      throw rewrapRealmError(error);
    }
  }

  async getAllAsync<T>(query: string, params: unknown[] = []): Promise<T[]> {
    return this.run(() => this.db.prepare(query).all(...normalizeParams(params)) as T[]);
  }

  async getFirstAsync<T>(query: string, params: unknown[] = []): Promise<T | null> {
    const row = this.run(() => this.db.prepare(query).get(...normalizeParams(params)));
    return (row as T | undefined) ?? null;
  }

  async runAsync(query: string, params: unknown[] = []): Promise<SQLiteRunResult> {
    const result = this.run(() => this.db.prepare(query).run(...normalizeParams(params)));
    return { lastInsertRowId: Number(result.lastInsertRowid), changes: result.changes };
  }

  async execAsync(source: string): Promise<void> {
    this.run(() => this.db.exec(source));
  }

  async withTransactionAsync(task: () => Promise<void>): Promise<void> {
    // better-sqlite3's .transaction() is sync-only; drive the transaction
    // manually so async callbacks (the shape expo-sqlite expects) work.
    this.run(() => this.db.exec('BEGIN'));
    try {
      await task();
      this.run(() => this.db.exec('COMMIT'));
    } catch (error) {
      this.run(() => this.db.exec('ROLLBACK'));
      throw error;
    }
  }

  async closeAsync(): Promise<void> {
    this.run(() => this.db.close());
  }
}

export async function openDatabaseAsync(_name: string): Promise<SQLiteDatabase> {
  return new SQLiteDatabase();
}
