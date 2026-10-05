import { whenLandingReady } from '@/features/launch/landing-readiness';
import { useUserStore } from '@/stores/user/user-store';
import {
  DEFAULT_SPORTS_BACKGROUND_REFRESH,
  type SportsBackgroundRefresh,
} from '@/types/user.types';
import { useEffect, useMemo } from 'react';
import { AppState, InteractionManager } from 'react-native';

import {
  getSportsWarmPromise,
  runForegroundRefresh,
  warmAdjacentDays,
} from './foreground-refresh';
import { refreshStateStore } from './refresh-state-store';

/** The adjacent-day warm runs once per launch, not on every settings change. */
let warmedAdjacentDays = false;

/**
 * A floor under the launch warm. `runAfterInteractions` fires as soon as the
 * interaction queue happens to be empty, which on a cold launch is well before
 * the first screen has settled — the fan-out of provider requests then competes
 * with the data that screen is waiting for.
 */
const LAUNCH_WARM_DELAY_MS = 3_000;

/**
 * How long the adjacent-day warm waits for the sports day view before going
 * ahead. Longer than the loading screen's own cap: this wait exists to keep the
 * warm off the request pacer the visible list is using, and a launch that never
 * opens the sports tab has no day view to wait for at all.
 */
const DAY_VIEW_SETTLE_TIMEOUT_MS = 10_000;

interface SportsRefreshSettings {
  /** False until the user is loaded: the values below are only defaults until then. */
  hasUser: boolean;
  /** No sports tab, no sports traffic: every refresh is for that tab alone. */
  sportsEnabled: boolean;
  pref: SportsBackgroundRefresh;
}

/**
 * The current user's sports refresh settings.
 *
 * Selects the primitives, never the user object: this lives in the root
 * layout, and the object is replaced on every settings write — subscribing to
 * it would re-render the whole app whenever any preference changes.
 */
function useSportsRefreshSettings(): SportsRefreshSettings {
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
  const sportsEnabled = useUserStore((s) => s.currentUser?.settings?.showSportsTab ?? true);
  const hasUser = useUserStore((s) => s.currentUser !== null);

  const pref = useMemo(
    () => ({ mode, intervalHours, dailyTime, refreshOnOpen }),
    [mode, intervalHours, dailyTime, refreshOnOpen]
  );
  return { hasUser, sportsEnabled, pref };
}

/**
 * The sports refresh the background task should run on: the user's own
 * preference, `off` while the sports tab is hidden, or `null` until the user is
 * loaded (acting on the defaults would schedule a refresh for someone who
 * turned it off).
 */
export function useEffectiveSportsRefresh(): SportsBackgroundRefresh | null {
  return useEffective(useSportsRefreshSettings());
}

function useEffective({
  hasUser,
  sportsEnabled,
  pref,
}: SportsRefreshSettings): SportsBackgroundRefresh | null {
  return useMemo(() => {
    if (!hasUser) return null;
    // A hidden sports tab means the whole feature is off: nothing displays the
    // data a refresh would fetch. Turning the tab back on restores the mode.
    return sportsEnabled ? pref : { ...pref, mode: 'off' };
  }, [hasUser, sportsEnabled, pref]);
}

/**
 * Keeps the device-level copy of the sports refresh preference in step with
 * the current user's, and drives the "refresh when opening" half of it. Mount
 * once, in the root layout.
 *
 * The copy is what the OS background task reads on a wake (see
 * `refresh-state-store`). It lands even when the OS refuses background work:
 * the "refresh when opening" half still reads it, and a later wake runs on it
 * if the restriction is lifted. Registering the OS task itself is app-level
 * (`src/background/use-background-task`), since it serves the playlist sync as
 * much as this refresh.
 *
 * A cold launch counts as the first open, so it is governed by the same
 * `refreshOnOpen` flag as every later foreground. Both run on the standard
 * TTLs, which makes them a no-op while the cache is fresh.
 */
export function useBackgroundRefresh(): void {
  const settings = useSportsRefreshSettings();
  const effective = useEffective(settings);
  const { hasUser, sportsEnabled } = settings;
  const { refreshOnOpen } = settings.pref;

  useEffect(() => {
    if (!effective) return;
    refreshStateStore.setPreference(effective).catch((err: unknown) => {
      console.warn('[sports-refresh] Could not store the refresh preference:', err);
    });
  }, [effective]);

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
      // The boot sequence starts today's warm while the loading screen is
      // still up (see `use-playlist-init`), so this joins that run instead of
      // paying for a second fan-out. Only a launch that never started one —
      // the preference was turned on mid-session — runs it here.
      try {
        await (getSportsWarmPromise() ?? runForegroundRefresh());
      } catch (err) {
        console.warn('[sports-refresh] Foreground refresh failed:', err);
        return;
      }
      warmedAdjacentDays = true;
      // Every provider request shares one pacer, so days the user is not
      // looking at wait for the day view to have its own.
      await whenLandingReady('sports', DAY_VIEW_SETTLE_TIMEOUT_MS);
      await warmAdjacentDays();
    };

    // The cold launch is the first "open" — and the only one AppState never
    // reports, since the app is already 'active' by the time this mounts.
    // Deferred behind the first interactions, and never sooner than
    // {@link LAUNCH_WARM_DELAY_MS}, so a fan-out of provider requests never
    // competes with the first paint.
    let cancelled = false;
    let warmTimer: ReturnType<typeof setTimeout> | undefined;
    const launchWarm = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      warmTimer = setTimeout(() => {
        if (cancelled) return;
        if (warmedAdjacentDays) refresh();
        else void warmOnLaunch();
      }, LAUNCH_WARM_DELAY_MS);
    });

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') refresh();
    });
    return () => {
      cancelled = true;
      launchWarm.cancel();
      if (warmTimer) clearTimeout(warmTimer);
      subscription.remove();
    };
  }, [hasUser, refreshOnOpen, sportsEnabled]);
}
