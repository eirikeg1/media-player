import type { SportsBackgroundRefresh } from '@/types/user.types';

/**
 * The two things the background refresh needs from the platform. Keeping them
 * as interfaces lets the domain stay free of expo imports: the adapter that
 * implements them lives outside this directory, and the tests use fakes.
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

/** The OS-level periodic task the refresh is driven by. */
export interface BackgroundScheduler {
  /** Register (or re-register) the periodic OS task. minutes >= 15. */
  register(minutes: number): Promise<void>;
  unregister(): Promise<void>;
  /** False when the OS denies background work (restricted, disabled, or unsupported). */
  isAvailable(): Promise<boolean>;
}
