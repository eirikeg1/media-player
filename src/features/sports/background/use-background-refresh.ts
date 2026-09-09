import { useUserStore } from '@/stores/user/user-store';
import {
  DEFAULT_SPORTS_BACKGROUND_REFRESH,
  type SportsBackgroundRefresh,
} from '@/types/user.types';
import { useEffect } from 'react';
import { AppState, InteractionManager } from 'react-native';

import { expoBackgroundScheduler } from './expo-scheduler';
import { runForegroundRefresh, warmAdjacentDays } from './foreground-refresh';
import { refreshStateStore } from './refresh-state-store';
import { schedulerIntervalMinutes } from './refresh-policy';

/** Warn once per launch — an unavailable OS scheduler stays unavailable. */
let warnedUnavailable = false;

/** The adjacent-day warm runs once per launch, not on every settings change. */
let warmedAdjacentDays = false;

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
 *
 * Also drives the "refresh when opening" half of the preference: a cold launch
 * counts as the first open, so it is governed by the same `refreshOnOpen` flag
 * as every later foreground. Both run on the standard TTLs, which makes them a
 * no-op while the cache is fresh.
 */
export function useBackgroundRefresh(): void {
  // Select the primitives, never the user object: this hook lives in the root
  // layout, and the object is replaced on every settings write — subscribing to
  // it would re-render the whole app whenever any preference changes.
  const mode = useUserStore(
    (s) =>
      s.currentUser?.settings?.sportsBackgroundRefresh?.mode ??
      DEFAULT_SPORTS_BACKGROUND_REFRESH.mode
  );
  const intervalHours = useUserStore(
    (s) =>
      s.currentUser?.settings?.sportsBackgroundRefresh?.intervalHours ??
      DEFAULT_SPORTS_BACKGROUND_REFRESH.intervalHours
  );
  const dailyTime = useUserStore(
    (s) =>
      s.currentUser?.settings?.sportsBackgroundRefresh?.dailyTime ??
      DEFAULT_SPORTS_BACKGROUND_REFRESH.dailyTime
  );
  const refreshOnOpen = useUserStore(
    (s) =>
      s.currentUser?.settings?.sportsBackgroundRefresh?.refreshOnOpen ??
      DEFAULT_SPORTS_BACKGROUND_REFRESH.refreshOnOpen
  );
  // No sports tab, no sports traffic: every warm below is for that tab alone.
  const sportsEnabled = useUserStore((s) => s.currentUser?.settings?.showSportsTab ?? true);
  // Until the user is loaded, the settings above are only defaults — acting on
  // them would make a user who turned the sports tab off pay for it anyway.
  const hasUser = useUserStore((s) => s.currentUser !== null);

  useEffect(() => {
    void applyPreference({ mode, intervalHours, dailyTime, refreshOnOpen });
  }, [mode, intervalHours, dailyTime, refreshOnOpen]);

  useEffect(() => {
    if (!hasUser || !refreshOnOpen || !sportsEnabled) return;
    // Standard TTLs, so a refresh is a no-op whenever the cache is still fresh.
    const refresh = () => {
      runForegroundRefresh().catch((err) => {
        console.warn('[sports-refresh] Foreground refresh failed:', err);
      });
    };

    // Warm today's cache so the sports tab has it before the user gets there,
    // then the two surrounding days so the date strip pages onto cached data.
    // The adjacent days run once per launch: later foregrounds re-warm today
    // (it has the shortest TTL), the rest is still fresh from this pass. The
    // flag is only set once the warm has actually happened — setting it up
    // front would let one offline launch disable it for the whole process.
    const warmOnLaunch = async () => {
      try {
        await runForegroundRefresh();
      } catch (err) {
        console.warn('[sports-refresh] Foreground refresh failed:', err);
        return;
      }
      warmedAdjacentDays = true;
      await warmAdjacentDays();
    };

    // The cold launch is the first "open" — and the only one AppState never
    // reports, since the app is already 'active' by the time this mounts.
    // Deferred behind the first interactions so a fan-out of provider requests
    // never competes with the first paint.
    let cancelled = false;
    const launchWarm = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      if (warmedAdjacentDays) refresh();
      else void warmOnLaunch();
    });

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') refresh();
    });
    return () => {
      cancelled = true;
      launchWarm.cancel();
      subscription.remove();
    };
  }, [hasUser, refreshOnOpen, sportsEnabled]);
}
