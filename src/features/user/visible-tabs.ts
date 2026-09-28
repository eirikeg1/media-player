import type { UserSettings } from '@/types/user.types';

/** The user settings that hide a tab when `false`. */
type TabVisibilitySetting = 'showHomeTab' | 'showLiveTab' | 'showVideosTab' | 'showSportsTab';

/** One tab of the tab group, named the way readiness reporters refer to it. */
export type TabKey = 'home' | 'live' | 'videos' | 'sports' | 'settings';

/**
 * The href a tab is navigated to by — the whole set, so anywhere a tab is a
 * destination (a redirect after sign-in, a detail route's fallback) a typo
 * cannot compile.
 *
 * The short form is what the router resolves to the tab itself. Home is the one
 * exception: its short form is `/`, which is also the root redirect's own
 * route, so it keeps the group prefix rather than bouncing back through the
 * redirect that sent the user here.
 */
export type TabHref = '/(tabs)' | '/live' | '/videos' | '/sports' | '/settings';

interface TabRoute {
  key: TabKey;
  href: TabHref;
  /** Absent for a tab the user cannot hide. */
  hiddenWhen?: TabVisibilitySetting;
}

/**
 * The tabs in the order `(tabs)/_layout` lists them. Settings has no toggle, so
 * it is the guaranteed landing place: a user who has hidden every other tab
 * still has somewhere to arrive.
 */
const TABS: readonly TabRoute[] = [
  { key: 'home', href: '/(tabs)', hiddenWhen: 'showHomeTab' },
  { key: 'live', href: '/live', hiddenWhen: 'showLiveTab' },
  { key: 'videos', href: '/videos', hiddenWhen: 'showVideosTab' },
  { key: 'sports', href: '/sports', hiddenWhen: 'showSportsTab' },
  { key: 'settings', href: '/settings' },
];

/** The settings tab, which no setting can hide — hence always a valid landing. */
const FALLBACK_TAB = TABS[TABS.length - 1];

function firstVisibleTab(settings: UserSettings | undefined): TabRoute {
  // Unreachable fallback in practice: the settings tab has no `hiddenWhen`.
  return TABS.find(({ hiddenWhen }) => !hiddenWhen || settings?.[hiddenWhen] !== false)
    ?? FALLBACK_TAB;
}

/**
 * Where to send someone entering the tab group.
 *
 * Redirecting to `/(tabs)` unconditionally lands on Home even when the user has
 * hidden it, leaving them on a screen with no tab to return to.
 */
export function firstVisibleTabHref(settings: UserSettings | undefined): TabHref {
  return firstVisibleTab(settings).href;
}

/**
 * Which tab that redirect lands on — the screen whose first data the loading
 * screen waits for (see `features/launch/landing-readiness`).
 */
export function firstVisibleTabKey(settings: UserSettings | undefined): TabKey {
  return firstVisibleTab(settings).key;
}
