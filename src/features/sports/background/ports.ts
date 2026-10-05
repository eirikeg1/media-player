import type { SportsBackgroundRefresh } from '@/types/user.types';

/**
 * What the sports refresh needs from the platform, as an interface: the task
 * stays free of expo imports, and the tests use a fake. The OS task that runs
 * the refresh is app-level (`src/background/`), as it serves the playlist sync
 * too.
 */

/**
 * Durable state the refresh reads on an OS wake.
 *
 * A headless wake has no store, no database and possibly no active user, so the
 * preference is mirrored here on top of the user's settings row — this copy is
 * what the task actually reads.
 */
export interface RefreshStateStore {
  /** Epoch millis of the last successful run, or null if it never ran. */
  getLastRunAt(): Promise<number | null>;
  setLastRunAt(ts: number): Promise<void>;
  /** Device-level copy of the preference; null when nothing was ever saved. */
  getPreference(): Promise<SportsBackgroundRefresh | null>;
  setPreference(pref: SportsBackgroundRefresh): Promise<void>;
}
