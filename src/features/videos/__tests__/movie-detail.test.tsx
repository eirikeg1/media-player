/**
 * The movie detail surface is a route now, not a modal held in the grid's
 * state, and it launches playback itself. That is the whole point of the move:
 * the push happens from inside the detail route, so backing out of the player
 * lands back on the title rather than on the grid.
 */
import { MovieDetail } from '@/features/videos/movie-detail';
import { channelParam, hrefParam } from '@/lib/route-params';
import { usePlaybackQueueStore } from '@/stores/video/queue-store';
import type { Channel } from '@/types/playlist.types';
import { render, screen, userEvent } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
}));

const SAFE_AREA_METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const renderDetail = (element: ReactElement) =>
  render(<SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>{element}</SafeAreaProvider>);

const MOVIE: Channel = {
  name: 'Dune: Part Two',
  url: 'http://panel.example/movie/user/pass/12345.mkv',
  tvg: { id: 'movie:12345' },
  group: { title: 'Action | Sci-Fi' },
};

describe('MovieDetail', () => {
  it('shows the title, its categories and a way out', async () => {
    const onClose = jest.fn();
    await renderDetail(<MovieDetail movie={MOVIE} playlistId="playlist-1" onClose={onClose} />);

    expect(screen.getByText('Dune: Part Two')).toBeTruthy();
    expect(screen.getByText('Action')).toBeTruthy();
    expect(screen.getByText('Sci-Fi')).toBeTruthy();

    await userEvent.press(screen.getByLabelText('Close modal'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('pushes the player itself, keyed by the channel id playback uses', async () => {
    await renderDetail(<MovieDetail movie={MOVIE} playlistId="playlist-1" onClose={jest.fn()} />);

    await userEvent.press(screen.getByText('Play'));

    expect(mockPush).toHaveBeenCalledTimes(1);
    const push = mockPush.mock.calls[0][0] as { pathname: string; params: Record<string, string> };
    expect(push.pathname).toBe('/video-player');
    expect(push.params).toMatchObject({
      channelId: 'movie:12345',
      playlistId: 'playlist-1',
      contentType: 'movie',
    });
  });

  it('tells the session which surface launched it, so the mini bar can return here', async () => {
    await renderDetail(<MovieDetail movie={MOVIE} playlistId="playlist-1" onClose={jest.fn()} />);

    await userEvent.press(screen.getByText('Play'));

    const push = mockPush.mock.calls[0][0] as { params: Record<string, string> };
    expect(hrefParam.decode(push.params.origin)).toEqual({
      pathname: '/movie',
      params: { playlistId: 'playlist-1', channel: channelParam.encode(MOVIE) },
    });
  });

  it('clears any queue a series left staged before starting a movie', async () => {
    usePlaybackQueueStore.getState().stageQueue('series:1', [MOVIE, MOVIE], 1);
    await renderDetail(<MovieDetail movie={MOVIE} playlistId="playlist-1" onClose={jest.fn()} />);

    await userEvent.press(screen.getByText('Play'));

    // A movie is a session of one: a stale queue would give it a "next episode".
    expect(usePlaybackQueueStore.getState().staged).toBeNull();
  });
});
