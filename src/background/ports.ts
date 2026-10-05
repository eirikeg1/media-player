/**
 * What the app's background task needs from the platform, as interfaces: the
 * one adapter that implements them (`expo-background-task.ts`) is the only
 * module in this directory that imports expo, and the tests use fakes.
 */

/** The OS-level periodic task the background work is driven by. */
export interface BackgroundScheduler {
  /** Register (or re-register) the periodic OS task. minutes >= 15. */
  register(minutes: number): Promise<void>;
  unregister(): Promise<void>;
  /** False when the OS denies background work (restricted, disabled, or unsupported). */
  isAvailable(): Promise<boolean>;
}
