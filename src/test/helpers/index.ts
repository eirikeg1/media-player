import { closeDatabase, getDatabase } from '@/db/sqlite-client';
import { runMigrations } from '@/db/migrations';
import {
  __captureDatabaseTemplate,
  __hasDatabaseTemplate,
} from '@/test/fakes/expo-sqlite-fake';
import { __resetM3uFake } from '@/test/fakes/m3u-database-fake';

/**
 * Give the current test a fresh, fully migrated app database (iptv.db fake)
 * and empty Rust-backend state. Call in `beforeEach` of any suite touching
 * repositories, services, or stores.
 *
 * Migrations run once per test file: the first reset migrates a fresh
 * database and snapshots it as a template; later resets open a pristine copy
 * of that snapshot instead of re-running every migration.
 */
export async function resetTestDatabases(): Promise<void> {
  __resetM3uFake();
  await closeDatabase();
  if (!__hasDatabaseTemplate()) {
    await runMigrations();
    __captureDatabaseTemplate(await getDatabase());
  }
  // next getDatabase() opens a fresh copy of the migrated template
}

/** Advance the fake clock so the next write gets a later timestamp. Requires `jest.useFakeTimers()`. */
export function tick(ms = 1000): void {
  jest.setSystemTime(new Date(jest.now() + ms));
}

/** Let fire-and-forget promise chains (e.g. EPG auto-import, favorite hydration) settle. */
export async function flushAsync(rounds = 10): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

interface ResettableStore<T> {
  setState: (state: T, replace: true) => void;
  getInitialState: () => T;
}

/**
 * Restore Zustand stores to their initial state between tests.
 * Usage: `beforeEach(() => resetStores(useUserStore, usePlaylistStore))`.
 */
export function resetStores(...stores: ResettableStore<any>[]): void {
  for (const store of stores) {
    store.setState(store.getInitialState(), true);
  }
}
