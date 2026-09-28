/**
 * The Live tab no longer holds the open channel surface in its own state.
 * Pressing a channel is a navigation, carrying the channel itself in the route
 * parameters — which is what keeps the grid mounted behind it and puts the
 * detail surface in router history, so the player it launches comes back to the
 * channel rather than to the grid.
 *
 * The queue cannot travel that way (a live playlist is thousands of rows), so
 * it is staged in the session store here and picked up by the player two pushes
 * later; that hand-off is the other half of what this file pins down.
 *
 * The data hooks are stubbed: what is under test is the handoff, not the
 * queries that fill the grid.
 */
import LiveScreen from '@/app/(tabs)/live';
import { getChannelId } from '@/lib/channel-utils';
import { channelParam } from '@/lib/route-params';
import { usePlaybackQueueStore } from '@/stores/video/queue-store';
import type { Channel } from '@/types/playlist.types';
import { render, screen, userEvent } from '@testing-library/react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
}));

const BBC: Channel = {
  name: 'BBC One HD',
  url: 'http://panel.example/live/user/pass/4242.ts',
  tvg: { id: 'bbc.one.uk' },
  group: { title: 'UK | Entertainment' },
};

const ITV: Channel = {
  name: 'ITV1 HD',
  url: 'http://panel.example/live/user/pass/4243.ts',
  tvg: { id: 'itv1.uk' },
  group: { title: 'UK | Entertainment' },
};

jest.mock('@/features/live/hooks/use-playlist-data', () => ({
  usePlaylistData: () => ({
    activePlaylist: { id: 'playlist-1', name: 'Main' },
    hasLoadedPlaylist: true,
  }),
}));

jest.mock('@/features/live/hooks/use-favorite-channels', () => ({
  useFavoriteChannels: () => ({
    favoriteChannels: [],
    hasLoadedFavorites: true,
    isRefreshing: false,
    handleRefresh: jest.fn(),
  }),
}));

jest.mock('@/features/live/hooks/use-favorite-groups', () => ({
  useFavoriteGroups: () => ({ favoriteGroups: [], isLoading: false, toggleFavorite: jest.fn() }),
}));

jest.mock('@/features/live/hooks/use-groups', () => ({
  useGroups: () => ({ groups: [], isLoading: false, error: null, retry: jest.fn() }),
}));

jest.mock('@/features/live/hooks/use-current-programmes', () => ({
  useCurrentProgrammes: () => ({ programmes: new Map(), isLoading: false }),
}));

jest.mock('@/features/live/hooks/use-paginated-channels', () => ({
  usePaginatedChannels: () => ({
    channels: [BBC, ITV],
    isLoading: false,
    isLoadingMore: false,
    isRefreshing: false,
    hasMore: false,
    loadMore: jest.fn(),
    error: null,
    refresh: jest.fn(),
    retry: jest.fn(),
  }),
}));

jest.mock('@/features/launch/use-report-landing-ready', () => ({
  useReportLandingReady: jest.fn(),
}));

// The grid itself is a virtualised list of cells; press targets are all this
// test needs from it.
jest.mock('@/features/live/live-screen-content', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    LiveScreenContent: ({
      channels,
      onChannelPress,
    }: {
      channels: Channel[];
      onChannelPress: (channel: Channel) => void;
    }) => (
      <>
        {channels.map((channel) => (
          <Text key={channel.name} onPress={() => onChannelPress(channel)}>
            {channel.name}
          </Text>
        ))}
      </>
    ),
  };
});

beforeEach(() => {
  usePlaybackQueueStore.getState().reset();
});

describe('Live tab navigation', () => {
  it('pushes the channel detail route with the channel encoded', async () => {
    await render(<LiveScreen />);

    await userEvent.press(screen.getByText('BBC One HD'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/channel',
      params: { playlistId: 'playlist-1', channel: channelParam.encode(BBC) },
    });
  });

  it('stages the loaded channels so next/previous walks this list', async () => {
    await render(<LiveScreen />);

    await userEvent.press(screen.getByText('ITV1 HD'));

    // Staged on press and consumed by the player, two pushes later: nothing in
    // between takes the hand-over (see `takeStagedQueue`).
    expect(usePlaybackQueueStore.getState().staged).toEqual({
      // Keyed by the channel pressed, so abandoning the sheet without playing
      // cannot leave this queue waiting for an unrelated launch.
      channelId: getChannelId(ITV),
      channels: [BBC, ITV],
      index: 1,
    });
  });
});
