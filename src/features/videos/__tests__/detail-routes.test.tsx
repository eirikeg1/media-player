/**
 * The `(detail)` routes for movies and series.
 *
 * They live in `src/app`, but their tests cannot: every `.tsx` under the app
 * directory becomes a route, so a `__tests__` folder there would show up in the
 * router as one.
 *
 * What is worth pinning down here is the parameter contract — a route parameter
 * survives a process restart and hand-edited deep links, so an unreadable one
 * has to become an error state with a way out rather than a crash inside the
 * detail component.
 */
import MovieDetailRoute from '@/app/(detail)/movie';
import SeriesDetailRoute from '@/app/(detail)/series';
import { channelParam, seriesInfoParam } from '@/lib/route-params';
import type { Channel } from '@/types/playlist.types';
import { render, screen, userEvent } from '@testing-library/react-native';
import type { SeriesInfo } from 'expo-m3u-parser';

const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn();
const mockUseLocalSearchParams = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  useRouter: () => ({
    push: jest.fn(),
    back: mockBack,
    replace: mockReplace,
    canGoBack: mockCanGoBack,
  }),
}));

// The detail surfaces themselves are covered by their own tests; here they only
// have to prove they were handed the decoded value.
jest.mock('@/features/videos/movie-detail', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    MovieDetail: ({ movie, playlistId }: { movie: Channel; playlistId: string }) => (
      <Text>{`movie:${movie.name}@${playlistId}`}</Text>
    ),
  };
});

jest.mock('@/features/videos/series-detail', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    SeriesDetail: ({ series, playlistId }: { series: SeriesInfo; playlistId: string }) => (
      <Text>{`series:${series.seriesName}@${playlistId}`}</Text>
    ),
  };
});

// `clearMocks` clears calls but keeps implementations, so the fallback case
// below would otherwise leak into every later test.
beforeEach(() => {
  mockCanGoBack.mockReturnValue(true);
});

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

describe('movie detail route', () => {
  it('renders the movie carried in the route parameters', async () => {
    mockUseLocalSearchParams.mockReturnValue({
      playlistId: 'playlist-1',
      channel: channelParam.encode(MOVIE),
    });

    await render(<MovieDetailRoute />);

    expect(screen.getByText('movie:Dune: Part Two@playlist-1')).toBeTruthy();
  });

  it('shows a recoverable error for an unreadable parameter', async () => {
    mockUseLocalSearchParams.mockReturnValue({
      playlistId: 'playlist-1',
      channel: 'not json',
    });

    await render(<MovieDetailRoute />);

    expect(screen.getByText("Can't Open This Movie")).toBeTruthy();
    await userEvent.press(screen.getByText('Go Back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('shows the same error when there is no playlist to open it against', async () => {
    mockUseLocalSearchParams.mockReturnValue({ channel: channelParam.encode(MOVIE) });

    await render(<MovieDetailRoute />);

    expect(screen.getByText("Can't Open This Movie")).toBeTruthy();
  });

  it('falls back to the videos tab when the route is the whole stack', async () => {
    // A deep link straight into the detail route has nothing to pop, and
    // `back()` would leave a close button that does not close.
    mockCanGoBack.mockReturnValue(false);
    mockUseLocalSearchParams.mockReturnValue({ playlistId: 'playlist-1', channel: '{}' });

    await render(<MovieDetailRoute />);
    await userEvent.press(screen.getByText('Go Back'));

    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/videos');
  });
});

describe('series detail route', () => {
  it('renders the series carried in the route parameters', async () => {
    mockUseLocalSearchParams.mockReturnValue({
      playlistId: 'playlist-1',
      series: seriesInfoParam.encode(SERIES),
    });

    await render(<SeriesDetailRoute />);

    expect(screen.getByText('series:Severance@playlist-1')).toBeTruthy();
  });

  it('shows a recoverable error for an unreadable parameter', async () => {
    mockUseLocalSearchParams.mockReturnValue({
      playlistId: 'playlist-1',
      series: '{"seriesName":"Severance"}',
    });

    await render(<SeriesDetailRoute />);

    expect(screen.getByText("Can't Open This Series")).toBeTruthy();
    await userEvent.press(screen.getByText('Go Back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
