/**
 * The Videos tab no longer holds the open detail surface in its own state.
 * Pressing a title is a navigation, carrying the title itself in the route
 * parameters — which is what keeps the grid mounted behind it and puts the
 * detail surface in router history, so the player it launches comes back to the
 * title rather than to the grid.
 *
 * The data hooks are stubbed: what is under test is the handoff, not the
 * queries that fill the grid.
 */
import VideosScreen from '@/app/(tabs)/videos';
import { channelParam, seriesInfoParam } from '@/lib/route-params';
import type { Channel } from '@/types/playlist.types';
import { render, screen, userEvent } from '@testing-library/react-native';
import type { SeriesInfo } from 'expo-m3u-parser';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
}));

const MOVIE: Channel = {
  name: 'Dune: Part Two',
  url: 'http://panel.example/movie/user/pass/12345.mkv',
  tvg: { id: 'movie:12345' },
  group: { title: 'Action' },
};

const SERIES: SeriesInfo = {
  seriesName: 'Severance',
  groupName: 'Drama',
  episodeCount: 19,
  poster: null,
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

jest.mock('@/features/live/hooks/use-paginated-channels', () => ({
  usePaginatedChannels: () => ({
    channels: [MOVIE],
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

jest.mock('@/features/videos/hooks/use-paginated-series', () => ({
  usePaginatedSeries: () => ({
    series: [SERIES],
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
jest.mock('@/features/videos/videos-screen-content', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    VideosScreenContent: ({
      channels,
      seriesList,
      onChannelPress,
      onSeriesPress,
    }: {
      channels: Channel[];
      seriesList?: SeriesInfo[];
      onChannelPress: (channel: Channel) => void;
      onSeriesPress?: (series: SeriesInfo) => void;
    }) => (
      <>
        {channels.map((channel) => (
          <Text key={channel.name} onPress={() => onChannelPress(channel)}>
            {channel.name}
          </Text>
        ))}
        {seriesList?.map((series) => (
          <Text key={series.seriesName} onPress={() => onSeriesPress?.(series)}>
            {series.seriesName}
          </Text>
        ))}
      </>
    ),
  };
});

describe('Videos tab navigation', () => {
  it('pushes the movie detail route with the movie encoded', async () => {
    await render(<VideosScreen />);

    await userEvent.press(screen.getByText('Dune: Part Two'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/movie',
      params: { playlistId: 'playlist-1', channel: channelParam.encode(MOVIE) },
    });
  });

  it('pushes the series detail route with the series encoded', async () => {
    await render(<VideosScreen />);

    await userEvent.press(screen.getByText('Severance'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/series',
      params: { playlistId: 'playlist-1', series: seriesInfoParam.encode(SERIES) },
    });
  });
});
