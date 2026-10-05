import { playlistRepository } from '@/db/playlist-repository';
import { schedulerIntervalMinutes } from '@/features/sports/background/refresh-policy';
import { useEffectiveSportsRefresh } from '@/features/sports/background/use-background-refresh';
import { shortestSyncInterval } from '@/lib/sync-intervals';
import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import { useUserStore } from '@/stores/user/user-store';
import { useEffect } from 'react';

import { backgroundStateStore } from './background-state-store';
import { expoBackgroundScheduler } from './expo-background-task';
import { backgroundWakeMinutes } from './wake-interval';

/** Warn once per launch — an unavailable OS scheduler stays unavailable. */
let warnedUnavailable = false;

/**
 * Applications of the schedule, one at a time: two settings changes in quick
 * succession must land in the order they were made, not in whichever order
 * their reads of the repository happen to finish.
 */
let applying: Promise<void> = Promise.resolve();

/**
 * (Un)register the OS task to match everything that could fall due: every
 * stored playlist's intervals — read from the repository, because the task
 * syncs all of them, not just the ones this user sees — and the sports
 * refresh's own cadence.
 */
function applySchedule(sportsWakeMinutes: number): Promise<void> {
  applying = applying.then(async () => {
    try {
      const minutes = backgroundWakeMinutes(await playlistRepository.getAll(), sportsWakeMinutes);
      if (minutes === 0) {
        await expoBackgroundScheduler.unregister();
        return;
      }

      if (!(await expoBackgroundScheduler.isAvailable())) {
        if (!warnedUnavailable) {
          warnedUnavailable = true;
          console.warn('[BackgroundTask] Background tasks are unavailable; nothing scheduled.');
        }
        return;
      }

      await expoBackgroundScheduler.register(minutes);
    } catch (err) {
      console.warn('[BackgroundTask] Could not apply the background schedule:', err);
    }
  });
  return applying;
}

/**
 * Keeps the app's OS background task registered at the cadence its work needs,
 * and mirrors the settings the task reads to where a headless wake can find
 * them. Mount once, in the root layout.
 *
 * The schedule is re-applied on every mount and not just on change: Android
 * drops a registered task when the user force-stops the app, so a plain
 * "register on change" would silently stop syncing until a setting was touched
 * again.
 *
 * Every selector returns a primitive, never an object: this hook lives in the
 * root layout, and the user and playlist objects are replaced on every write —
 * subscribing to them would re-render the whole app on any change.
 */
export function useBackgroundTask(): void {
  const sports = useEffectiveSportsRefresh();
  // Null until the user is loaded: the sports defaults are not their choice.
  const sportsWakeMinutes = sports ? schedulerIntervalMinutes(sports) : null;
  const playlistsReady = usePlaylistStore((s) => s.isInitialized);
  // Not the inputs (those are re-read from the repository) but the signals
  // that they changed: an interval edited, a playlist added or removed.
  const shortestInterval = usePlaylistStore((s) => shortestSyncInterval(s.playlists));
  const playlistCount = usePlaylistStore((s) => s.playlists.length);

  const hasUser = useUserStore((s) => s.currentUser !== null);
  const syncOnMobileData = useUserStore(
    (s) => s.currentUser?.settings?.backgroundSyncOnMobileData ?? false,
  );

  useEffect(() => {
    // Until the user is loaded this is only the default, and writing it would
    // overwrite the choice the last user left behind for the next wake.
    if (!hasUser) return;
    backgroundStateStore.setSyncOnMobileData(syncOnMobileData).catch((err: unknown) => {
      console.warn('[BackgroundTask] Could not store the mobile data preference:', err);
    });
  }, [hasUser, syncOnMobileData]);

  useEffect(() => {
    if (!playlistsReady || sportsWakeMinutes === null) return;
    void applySchedule(sportsWakeMinutes);
  }, [playlistsReady, sportsWakeMinutes, shortestInterval, playlistCount]);
}
