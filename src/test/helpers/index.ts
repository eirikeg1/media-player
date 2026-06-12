import { closeDatabase } from '@/db/sqlite-client';
import { runMigrations } from '@/db/migrations';
import { __resetM3uFake } from '@/test/fakes/m3u-database-fake';

/**
 * Give the current test a fresh, fully migrated app database (iptv.db fake)
 * and empty Rust-backend state. Call in `beforeEach` of any suite touching
 * repositories, services, or stores.
 */
export async function resetTestDatabases(): Promise<void> {
  __resetM3uFake();
  await closeDatabase(); // next getDatabase() opens a fresh :memory: instance
  await runMigrations();
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
