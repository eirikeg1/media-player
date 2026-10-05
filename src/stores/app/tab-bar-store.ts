import { create } from 'zustand';

interface TabBarState {
  /**
   * Measured height of the tab bar, safe-area inset included. Zero until the
   * tab group has laid its bar out (or while no tab group is mounted).
   */
  height: number;
  /** Whether the tab group is the route on screen — and its bar therefore visible. */
  isTabRouteFocused: boolean;

  setHeight: (height: number) => void;
  setTabRouteFocused: (focused: boolean) => void;
}

/**
 * Where the bottom chrome ends, published out of the tab navigator.
 *
 * The mini player bar is rendered once in the root layout so it stays on screen
 * over the detail routes, which puts it outside the tab navigator — where
 * `useBottomTabBarHeight()` throws and the tab bar's own layout is invisible.
 * The tab layout publishes both facts here instead, so the bar can dock on top
 * of the tab bar inside the tab group and at the safe-area edge everywhere else.
 */
export const useTabBarStore = create<TabBarState>((set) => ({
  height: 0,
  isTabRouteFocused: false,

  // Guarded: layout fires on every re-measure, and an unchanged value would
  // re-render the bar (and its attached VideoView) for nothing.
  setHeight: (height) => set((state) => (state.height === height ? state : { height })),
  setTabRouteFocused: (isTabRouteFocused) =>
    set((state) =>
      state.isTabRouteFocused === isTabRouteFocused ? state : { isTabRouteFocused }
    ),
}));
