import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { useContext, useMemo } from 'react';

import { useCastMiniPlayerStore } from '@/stores/video/cast-mini-player-store';
import { usePlaybackSessionStore } from '@/stores/video/playback-session-store';

/**
 * Height of `MiniPlayerBar`. Re-declared here because the component keeps its
 * `BAR_HEIGHT` private; the two values must stay in step.
 */
const MINI_PLAYER_BAR_HEIGHT = 60;

export interface ChromeInsets {
  /**
   * Space the floating bottom chrome covers: the tab bar when the screen is one
   * of the tabs, plus the mini player bar while a minimized session or a cast
   * session is showing.
   *
   * It is what the chrome *overlays*, not a safe-area inset — a surface that
   * already pads for the home indicator adds this on top of that.
   */
  bottom: number;
}

/**
 * Padding a scrollable screen needs so its last row clears the bottom chrome.
 *
 * Both the tab bar and the mini player bar float over the content — the tab bar
 * absolutely positioned by `app/(tabs)/_layout.tsx`, the mini player bar
 * rendered over the whole stack by the root layout — so screens are laid out
 * full-height and have to reserve the space themselves.
 *
 * It works on both sides of the tab navigator. The tab bar's height comes from
 * the context React Navigation publishes to the screens it hosts, which is
 * simply absent on a detail route — where there is no tab bar to clear, only
 * the mini player bar. (`useBottomTabBarHeight()` reads the same context but
 * throws when it is missing, so it cannot be called from a detail route.)
 */
export function useChromeInsets(): ChromeInsets {
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  // Mirrors MiniPlayerBar's own visibility rule.
  const hasCastBar = useCastMiniPlayerStore((state) => state.channel !== null);
  const hasMiniSession = usePlaybackSessionStore((state) => state.session?.mode === 'mini');

  const bottom = tabBarHeight + (hasCastBar || hasMiniSession ? MINI_PLAYER_BAR_HEIGHT : 0);

  return useMemo(() => ({ bottom }), [bottom]);
}
