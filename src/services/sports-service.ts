import { Paths } from 'expo-file-system';
import { SportsDatabase } from 'expo-m3u-parser';

const DB_NAME = 'sports.db';

// Singleton database instance.
// We cache the in-flight open *promise*, not the resolved value: the day view,
// the favorites list and the prefetch hooks all call this in the same tick when
// the sports tab mounts, and assigning only after the await would give each of
// them its own native handle. Every handle carries its own SofaScore rate
// limiter, so those would fire unspaced and trip the provider's 429 cooldown —
// and all but one of the handles would leak.
let databasePromise: Promise<SportsDatabase> | null = null;

/** Get the sports database file path in the app's document directory. */
function getDatabasePath(): string {
  return Paths.document.uri + DB_NAME;
}

/**
 * Get or create the sports database instance.
 *
 * Returns the same shared promise for every caller; only the first caller
 * triggers the underlying open. If opening fails the cached promise is cleared
 * so a later call can retry rather than being stuck on a rejection.
 */
export async function getSportsDatabase(): Promise<SportsDatabase> {
  if (!databasePromise) {
    const path = getDatabasePath();
    databasePromise = SportsDatabase.open(path).catch((err) => {
      databasePromise = null;
      throw err;
    });
  }
  return databasePromise;
}
