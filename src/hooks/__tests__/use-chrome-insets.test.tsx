/**
 * The bottom chrome floats over screen content — the tab bar absolutely
 * positioned by the tab layout, the mini player bar rendered over the whole
 * stack by the root layout — so every scroller has to reserve the space itself.
 *
 * What matters here is that the same hook works on both sides of the tab
 * navigator: a detail route is presented over the tabs, outside the navigator,
 * where the tab bar is neither present nor something to clear.
 */
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useChromeInsets } from '@/hooks/use-chrome-insets';
import { useCastMiniPlayerStore } from '@/stores/video/cast-mini-player-store';
import { usePlaybackSessionStore } from '@/stores/video/playback-session-store';
import type { PlaybackSession } from '@/stores/video/playback-session-store';
import { makeChannel } from '@/test/factories';
import { resetStores } from '@/test/helpers';

const TAB_BAR_HEIGHT = 83;
const MINI_PLAYER_BAR_HEIGHT = 60;

/** A screen inside the tab navigator, which is what publishes the bar height. */
const insideTabs = ({ children }: { children: ReactNode }) => (
  <BottomTabBarHeightContext.Provider value={TAB_BAR_HEIGHT}>
    {children}
  </BottomTabBarHeightContext.Provider>
);

/** Put a minimized session in the store without going near the native player. */
function minimizeSession(): void {
  usePlaybackSessionStore.setState({
    session: { mode: 'mini' } as unknown as PlaybackSession,
  });
}

beforeEach(() => {
  resetStores(usePlaybackSessionStore, useCastMiniPlayerStore);
});

describe('useChromeInsets', () => {
  it('reserves the tab bar on a tab screen', async () => {
    const { result } = await renderHook(() => useChromeInsets(), { wrapper: insideTabs });

    expect(result.current.bottom).toBe(TAB_BAR_HEIGHT);
  });

  it('reserves nothing on a detail route with nothing playing', async () => {
    // Outside the tab navigator there is no tab bar over the content, and the
    // surface pads for the home indicator itself.
    const { result } = await renderHook(() => useChromeInsets());

    expect(result.current.bottom).toBe(0);
  });

  it('adds the mini player bar to whatever chrome is already there', async () => {
    minimizeSession();

    const { result: onTab } = await renderHook(() => useChromeInsets(), { wrapper: insideTabs });
    const { result: onDetail } = await renderHook(() => useChromeInsets());

    expect(onTab.current.bottom).toBe(TAB_BAR_HEIGHT + MINI_PLAYER_BAR_HEIGHT);
    // The detail route's own scroller has to clear the bar too — it is the
    // reason the bar was hoisted out of the tab bar in the first place.
    expect(onDetail.current.bottom).toBe(MINI_PLAYER_BAR_HEIGHT);
  });

  it('reserves the bar for a cast session as well', async () => {
    useCastMiniPlayerStore
      .getState()
      .activate(makeChannel(), 'playlist-1', 'live', 'http://s/1', null);

    const { result } = await renderHook(() => useChromeInsets());

    expect(result.current.bottom).toBe(MINI_PLAYER_BAR_HEIGHT);
  });

  it('gives the bar back its space when the session ends', async () => {
    minimizeSession();
    const { result } = await renderHook(() => useChromeInsets(), { wrapper: insideTabs });
    expect(result.current.bottom).toBe(TAB_BAR_HEIGHT + MINI_PLAYER_BAR_HEIGHT);

    await act(() => {
      usePlaybackSessionStore.setState({ session: null });
    });

    expect(result.current.bottom).toBe(TAB_BAR_HEIGHT);
  });
});
