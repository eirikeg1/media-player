/**
 * The mini player bar is rendered once by the root layout, over the whole
 * stack, so minimizing the player leaves it reachable on a detail sheet as well
 * as on a tab. Two things follow from that and are pinned down here.
 *
 * Where it docks: outside the tab navigator there is no `useBottomTabBarHeight`
 * to ask, so the tab layout publishes what the bar needs (see `useTabBarStore`)
 * and the bar falls back to the safe-area edge when the tabs are not on screen.
 *
 * Where expanding leads: playback launched from a detail surface remembers it,
 * and expanding puts that surface back underneath the player — so backing out
 * of the player lands on the title rather than on whatever tab is current.
 */
import { render, screen, userEvent } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { MiniPlayerBar } from '@/features/video/components/mini-player-bar';
import { hrefParam } from '@/lib/route-params';
import { useTabBarStore } from '@/stores/app';
import { useCastMiniPlayerStore } from '@/stores/video/cast-mini-player-store';
import {
  usePlaybackSessionStore,
  type PlaybackSession,
} from '@/stores/video/playback-session-store';
import { makeChannel } from '@/test/factories';
import { resetStores } from '@/test/helpers';
import type { Channel } from '@/types/playlist.types';

const mockPush = jest.fn();
const mockNavigate = jest.fn();
const mockPathname = jest.fn<string, []>();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    navigate: mockNavigate,
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: () => true,
  }),
  usePathname: () => mockPathname(),
}));

// The cast half of the bar talks to a native session; nothing here casts.
jest.mock('react-native-google-cast', () => ({
  CastState: { CONNECTED: 'connected' },
  MediaPlayerState: { PLAYING: 'playing', BUFFERING: 'buffering' },
  useCastState: () => 'connected',
  useMediaStatus: () => null,
  useRemoteMediaClient: () => null,
}));

const SAFE_AREA_BOTTOM = 34;
const TAB_BAR_HEIGHT = 83;

const SAFE_AREA_METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: SAFE_AREA_BOTTOM },
};

const renderBar = (element: ReactElement) =>
  render(<SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>{element}</SafeAreaProvider>);

const CHANNEL: Channel = makeChannel({ name: 'BBC One HD', tvg: { id: 'bbc.one.uk' } });

const MOVIE_ORIGIN = {
  pathname: '/movie' as const,
  params: { playlistId: 'playlist-1', channel: 'encoded-movie' },
};

/**
 * A minimized session, without the native player a real one owns: the bar only
 * reads it, and its `VideoView` is the mocked one.
 */
function minimize(origin: PlaybackSession['origin'] = null): void {
  usePlaybackSessionStore.setState({
    session: {
      player: { playing: true, pause: jest.fn(), play: jest.fn() },
      channel: CHANNEL,
      streamUrl: CHANNEL.url,
      catchup: null,
      playlistId: 'playlist-1',
      contentType: 'movie',
      fixture: null,
      origin,
      startPosition: 0,
      mode: 'mini',
      screenViewAttached: false,
      sourceAttached: true,
      error: null,
    } as unknown as PlaybackSession,
  });
}

/** The `bottom` the bar's absolutely positioned dock was laid out with. */
function dockOffset(): number {
  const dock = screen.getByTestId('mini-player-dock');
  return (StyleSheet.flatten(dock.props.style) as { bottom: number }).bottom;
}

beforeEach(() => {
  mockPathname.mockReturnValue('/live');
  resetStores(usePlaybackSessionStore, useCastMiniPlayerStore, useTabBarStore);
});

describe('MiniPlayerBar docking', () => {
  it('sits directly on top of the tab bar while the tabs are on screen', async () => {
    useTabBarStore.getState().setHeight(TAB_BAR_HEIGHT);
    useTabBarStore.getState().setTabRouteFocused(true);
    minimize();

    await renderBar(<MiniPlayerBar />);

    expect(dockOffset()).toBe(TAB_BAR_HEIGHT);
  });

  it('sits at the safe-area edge over a detail route, where there is no tab bar', async () => {
    // The tab bar's measured height is still published — it is simply not on
    // screen, so docking above it would float the bar in mid-air.
    useTabBarStore.getState().setHeight(TAB_BAR_HEIGHT);
    useTabBarStore.getState().setTabRouteFocused(false);
    minimize();

    await renderBar(<MiniPlayerBar />);

    expect(dockOffset()).toBe(SAFE_AREA_BOTTOM);
  });
});

describe('MiniPlayerBar visibility', () => {
  it('shows the minimized session wherever the viewer is', async () => {
    minimize();

    await renderBar(<MiniPlayerBar />);

    expect(screen.getByText('BBC One HD')).toBeTruthy();
  });

  it('stays out of the way of the full-screen player', async () => {
    // Minimizing flips the session before the pop is dispatched, so the bar
    // would otherwise grow over a video still filling the screen.
    mockPathname.mockReturnValue('/video-player');
    minimize();

    await renderBar(<MiniPlayerBar />);

    expect(screen.queryByText('BBC One HD')).toBeNull();
  });
});

describe('MiniPlayerBar expand', () => {
  it('pushes the player on its own when playback has no launch origin', async () => {
    minimize();
    await renderBar(<MiniPlayerBar />);

    await userEvent.press(screen.getByText('BBC One HD'));

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush.mock.calls[0][0]).toMatchObject({
      pathname: '/video-player',
      params: { channelId: 'bbc.one.uk', playlistId: 'playlist-1', contentType: 'movie' },
    });
  });

  it('puts the launching surface back underneath the player', async () => {
    minimize(MOVIE_ORIGIN);
    await renderBar(<MiniPlayerBar />);

    await userEvent.press(screen.getByText('BBC One HD'));

    // Origin first, player second: back from the player then lands on the
    // sheet playback was started from.
    expect(mockNavigate).toHaveBeenCalledWith(MOVIE_ORIGIN);
    expect(mockPush).toHaveBeenCalledTimes(1);
    const push = mockPush.mock.calls[0][0] as { params: Record<string, string> };
    // Carried on, so a session restarted by the player screen keeps its origin.
    expect(hrefParam.decode(push.params.origin)).toEqual(MOVIE_ORIGIN);
  });

  it('does not stack a second copy of the surface it is already standing on', async () => {
    // Minimizing leaves the viewer on the launching sheet; expanding from there
    // must not push it again, or back would walk through it twice.
    mockPathname.mockReturnValue('/movie');
    minimize(MOVIE_ORIGIN);
    await renderBar(<MiniPlayerBar />);

    await userEvent.press(screen.getByText('BBC One HD'));

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('flips the session to fullscreen before the screen attaches its own view', async () => {
    minimize(MOVIE_ORIGIN);
    await renderBar(<MiniPlayerBar />);

    await userEvent.press(screen.getByText('BBC One HD'));

    // Android allows one attached view per player: the bar's has to go first.
    expect(usePlaybackSessionStore.getState().session?.mode).toBe('fullscreen');
  });
});
