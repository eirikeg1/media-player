/**
 * The series detail surface is a route now, not a modal held in the grid's
 * state. It stages the playback queue and pushes the player itself, so backing
 * out of an episode lands on the season list it was started from.
 */
import { SeriesDetail } from '@/features/videos/series-detail';
import { hrefParam, seriesInfoParam } from '@/lib/route-params';
import { usePlaybackQueueStore } from '@/stores/video/queue-store';
import type { Channel } from '@/types/playlist.types';
import { render, screen, userEvent } from '@testing-library/react-native';
import type { SeriesInfo } from 'expo-m3u-parser';
import type { ReactElement } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
}));

const mockEpisodes: Channel[] = [
  { name: 'Severance S01E02 - Half Loop', url: 'http://p/series/1/2.mkv', tvg: { id: 'episode:2' }, group: { title: 'Drama' } },
  { name: 'Severance S01E01 - Good News', url: 'http://p/series/1/1.mkv', tvg: { id: 'episode:1' }, group: { title: 'Drama' } },
  { name: 'Severance S02E01 - Hello, Ms Cobel', url: 'http://p/series/2/1.mkv', tvg: { id: 'episode:3' }, group: { title: 'Drama' } },
];

// The episode list is a network fetch of its own; this surface's job is what it
// does with the list, not how it arrives.
jest.mock('@/features/videos/hooks/use-series-episodes', () => ({
  useSeriesEpisodes: () => ({ episodes: mockEpisodes, isLoading: false, error: null }),
}));

const SAFE_AREA_METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const renderDetail = (element: ReactElement) =>
  render(<SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>{element}</SafeAreaProvider>);

const SERIES: SeriesInfo = {
  seriesName: 'Severance',
  groupName: 'Drama',
  episodeCount: 3,
  poster: null,
};

describe('SeriesDetail', () => {
  it('shows the series, its seasons and a way out', async () => {
    const onClose = jest.fn();
    await renderDetail(
      <SeriesDetail series={SERIES} playlistId="playlist-1" onClose={onClose} />
    );

    expect(screen.getByText('Severance')).toBeTruthy();
    expect(screen.getByText('3 episodes')).toBeTruthy();
    expect(screen.getByText('Season 1')).toBeTruthy();
    expect(screen.getByText('Season 2')).toBeTruthy();

    await userEvent.press(screen.getByLabelText('Close modal'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('pushes the player itself for the episode pressed', async () => {
    await renderDetail(
      <SeriesDetail series={SERIES} playlistId="playlist-1" onClose={jest.fn()} />
    );

    await userEvent.press(screen.getByText('Play from Beginning · S1 E1'));

    expect(mockPush).toHaveBeenCalledTimes(1);
    const push = mockPush.mock.calls[0][0] as { pathname: string; params: Record<string, string> };
    expect(push.pathname).toBe('/video-player');
    expect(push.params).toMatchObject({
      channelId: 'episode:1',
      playlistId: 'playlist-1',
      contentType: 'series',
    });
  });

  it('tells the session which surface launched it, so the mini bar can return here', async () => {
    await renderDetail(
      <SeriesDetail series={SERIES} playlistId="playlist-1" onClose={jest.fn()} />
    );

    await userEvent.press(screen.getByText('Play from Beginning · S1 E1'));

    const push = mockPush.mock.calls[0][0] as { params: Record<string, string> };
    expect(hrefParam.decode(push.params.origin)).toEqual({
      pathname: '/series',
      params: { playlistId: 'playlist-1', series: seriesInfoParam.encode(SERIES) },
    });
  });

  it('stages the whole series in playback order, positioned on that episode', async () => {
    await renderDetail(
      <SeriesDetail series={SERIES} playlistId="playlist-1" onClose={jest.fn()} />
    );

    await userEvent.press(screen.getByText('Play from Beginning · S1 E1'));

    // Season then episode, not the order the provider listed them in, so
    // next/previous walks the series the way it is meant to be watched.
    const staged = usePlaybackQueueStore.getState().staged;
    expect(staged?.channels.map((ch) => ch.name)).toEqual([
      'Severance S01E01 - Good News',
      'Severance S01E02 - Half Loop',
      'Severance S02E01 - Hello, Ms Cobel',
    ]);
    expect(staged?.index).toBe(0);
  });
});
