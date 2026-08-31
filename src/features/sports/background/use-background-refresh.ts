import { useUserStore } from '@/stores/user/user-store';
import {
  DEFAULT_SPORTS_BACKGROUND_REFRESH,
  type SportsBackgroundRefresh,
} from '@/types/user.types';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { expoBackgroundScheduler } from './expo-scheduler';
import { runForegroundRefresh } from './foreground-refresh';
import { refreshStateStore } from './refresh-state-store';
import { schedulerIntervalMinutes } from './refresh-policy';

/** Warn once per launch — an unavailable OS scheduler stays unavailable. */
let warnedUnavailable = false;

/**
 * Mirror the preference to the device-level store and (un)register the OS task
 * to match it.
 *
 * The preference always lands in the store, even when the OS refuses to run
 * background work: the "refresh when opening" half of the feature still reads
 * it, and it is what a later wake would run on if the restriction is lifted.
 */
async function applyPreference(pref: SportsBackgroundRefresh): Promise<void> {
  try {
    await refreshStateStore.setPreference(pref);

    const minutes = schedulerIntervalMinutes(pref);
    if (minutes === 0) {
      await expoBackgroundScheduler.unregister();
      return;
    }

    if (!(await expoBackgroundScheduler.isAvailable())) {
      if (!warnedUnavailable) {
        warnedUnavailable = true;
        console.warn('[sports-refresh] Background tasks are unavailable; refresh not scheduled.');
      }
      return;
    }

    await expoBackgroundScheduler.register(minutes);
  } catch (err) {
    console.warn('[sports-refresh] Could not apply the refresh schedule:', err);
  }
}

/**
 * Keeps the sports background refresh in sync with the current user's
 * preference. Mount once, in the root layout.
 *
 * The schedule is re-applied on every mount and not just on change: Android
 * drops a registered task when the user force-stops the app, so a plain
 * "register on change" would silently stop refreshing until the setting was
 * touched again.
 */
export function useBackgroundRefresh(): void {
  const currentUser = useUserStore((s) => s.currentUser);
  const { mode, intervalHours, dailyTime, refreshOnOpen } =
    currentUser?.settings?.sportsBackgroundRefresh ?? DEFAULT_SPORTS_BACKGROUND_REFRESH;

  // Depend on the fields rather than the preference object: the user object is
  // replaced on every settings write, so its identity says nothing about the
  // schedule.
  useEffect(() => {
    void applyPreference({ mode, intervalHours, dailyTime, refreshOnOpen });
  }, [mode, intervalHours, dailyTime, refreshOnOpen]);

  useEffect(() => {
    if (!refreshOnOpen) return;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') return;
      // Standard TTLs, so this is a no-op whenever the cache is still fresh.
      runForegroundRefresh().catch((err) => {
        console.warn('[sports-refresh] Foreground refresh failed:', err);
      });
    });
    return () => subscription.remove();
  }, [refreshOnOpen]);
}
