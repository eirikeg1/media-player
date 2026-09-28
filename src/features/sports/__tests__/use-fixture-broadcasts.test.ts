import { getSportsDatabase } from '@/services/sports-service';
import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { Fixture, RankedBroadcast, SportsDatabase } from 'expo-m3u-parser';

import { clearBroadcastCache } from '../broadcast-cache';
import { useFixtureBroadcasts } from '../hooks/use-fixture-broadcasts';

const PLAYLIST_ID = 'playlist-1';

function fixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    providerId: 1,
    provider: 'sofascore',
    competitionName: 'Premier League',
    homeTeam: 'Arsenal',
    awayTeam: 'Chelsea',
    kickoffTime: 1_700_000_000,
    status: 'scheduled',
    ...overrides,
  };
}

function broadcast(channelId: string): RankedBroadcast {
  return {
    channelId,
    title: 'Sky Sports',
    url: `http://stream.test/${channelId}`,
    group: 'Sports',
    confidence: 0.9,
    source: 'sofascore',
  };
}

let db: SportsDatabase;

beforeEach(async () => {
  jest.useFakeTimers();
  clearBroadcastCache();
  usePlaylistStore.setState({ activePlaylistId: PLAYLIST_ID });
  db = await getSportsDatabase();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('useFixtureBroadcasts', () => {
  it('runs the native matcher once and serves the reopened sheet from the cache', async () => {
    const match = jest
      .spyOn(db, 'findPlayableChannelsForFixture')
      .mockResolvedValue([broadcast('ch-1')]);

    const first = await renderHook(() => useFixtureBroadcasts(fixture()));
    await waitFor(() => expect(first.result.current.broadcasts).toHaveLength(1));
    await first.unmount();

    const second = await renderHook(() => useFixtureBroadcasts(fixture()));

    // The matcher holds the channel database lock, so a reopen must not run it
    // again — and must not flash a loading state while it doesn't.
    expect(second.result.current.broadcasts).toEqual([broadcast('ch-1')]);
    expect(second.result.current.isLoading).toBe(false);
    expect(match).toHaveBeenCalledTimes(1);
  });

  it('matches again once the cached result has expired', async () => {
    const match = jest
      .spyOn(db, 'findPlayableChannelsForFixture')
      .mockResolvedValue([broadcast('ch-1')]);

    const first = await renderHook(() => useFixtureBroadcasts(fixture()));
    await waitFor(() => expect(match).toHaveBeenCalledTimes(1));
    await first.unmount();

    jest.advanceTimersByTime(5 * 60_000);

    const second = await renderHook(() => useFixtureBroadcasts(fixture()));
    await waitFor(() => expect(match).toHaveBeenCalledTimes(2));
    expect(second.result.current.broadcasts).toHaveLength(1);
  });

  it('matches a different fixture separately', async () => {
    const match = jest
      .spyOn(db, 'findPlayableChannelsForFixture')
      .mockResolvedValue([broadcast('ch-1')]);

    const first = await renderHook(() => useFixtureBroadcasts(fixture({ providerId: 1 })));
    await waitFor(() => expect(match).toHaveBeenCalledTimes(1));
    await first.unmount();

    await renderHook(() => useFixtureBroadcasts(fixture({ providerId: 2 })));
    await waitFor(() => expect(match).toHaveBeenCalledTimes(2));
  });

  it('matches again after the caches behind it are dropped', async () => {
    const match = jest
      .spyOn(db, 'findPlayableChannelsForFixture')
      .mockResolvedValue([broadcast('ch-1')]);

    const first = await renderHook(() => useFixtureBroadcasts(fixture()));
    await waitFor(() => expect(match).toHaveBeenCalledTimes(1));
    await first.unmount();

    // A pull-to-refresh replaces the data the match was made over; the key
    // alone cannot tell, so the cache is dropped with it.
    clearBroadcastCache();

    await renderHook(() => useFixtureBroadcasts(fixture()));
    await waitFor(() => expect(match).toHaveBeenCalledTimes(2));
  });

  it('reports a crashed match as an error, and retries it on demand', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const match = jest
      .spyOn(db, 'findPlayableChannelsForFixture')
      .mockRejectedValueOnce(new Error('FfiException: channel database is locked'))
      .mockResolvedValue([broadcast('ch-1')]);

    const { result } = await renderHook(() => useFixtureBroadcasts(fixture()));

    // Not an empty result: the sheet must not claim the playlist carries no
    // channel for this match when the matcher never got to answer.
    await waitFor(() =>
      expect(result.current.error).toBe("Couldn't find channels for this match.")
    );
    expect(result.current.broadcasts).toEqual([]);

    // A failed run caches nothing, so the retry really does re-match.
    await act(async () => {
      result.current.retry();
    });
    await waitFor(() => expect(result.current.broadcasts).toHaveLength(1));
    expect(result.current.error).toBeNull();
    expect(match).toHaveBeenCalledTimes(2);
  });

  it('matches nothing without a fixture or an active playlist', async () => {
    const match = jest.spyOn(db, 'findPlayableChannelsForFixture');

    const { result } = await renderHook(() => useFixtureBroadcasts(null));
    expect(result.current.broadcasts).toEqual([]);

    usePlaylistStore.setState({ activePlaylistId: null });
    await renderHook(() => useFixtureBroadcasts(fixture()));

    expect(match).not.toHaveBeenCalled();
  });
});
