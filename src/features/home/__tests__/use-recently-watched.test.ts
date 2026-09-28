/**
 * The home page's "Continue Watching" row: what it asks the history for, how it
 * turns raw watch rows into one card per title, and how long it is allowed to
 * remember a series' poster.
 */
import { userRepository } from '@/db/user-repository';
import { clearPosterCache, loadRecentlyWatched } from '@/features/home/hooks/load-recently-watched';
import { useRecentlyWatched } from '@/features/home/hooks/use-recently-watched';
import { getRustDatabase } from '@/services/rust-channel-service';
import { HOME_CACHE_FRESH_MS, useFirstPageCacheStore, type RecentlyWatchedKey } from '@/stores/cache';
import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import { useUserStore } from '@/stores/user/user-store';
import { makeRustChannel } from '@/test/factories';
import { Database as M3uDatabaseFake } from '@/test/fakes/m3u-database-fake';
import { resetStores, resetTestDatabases, tick } from '@/test/helpers';
import type { ContentType, RecentlyWatchedItem, User } from '@/types/user.types';
import { act, renderHook, waitFor } from '@testing-library/react-native';

type FakeDb = InstanceType<typeof M3uDatabaseFake>;

const PLAYLIST_ID = 'pl-1';

let db: FakeDb;
let user: User;

/** Two episodes of one series, a movie and a live channel. */
function seedCatalogue(playlistId = PLAYLIST_ID): void {
  db.__seedChannels(playlistId, [
    makeRustChannel({
      title: 'Breaking Bad S01E01',
      tvgId: 'ep-1',
      contentType: 'series',
      tvgLogo: 'https://logos.example.com/bb.png',
    }),
    makeRustChannel({
      title: 'Breaking Bad S01E02',
      tvgId: 'ep-2',
      contentType: 'series',
      tvgLogo: 'https://logos.example.com/bb.png',
    }),
    makeRustChannel({ title: 'Blade Runner', tvgId: 'movie-1', contentType: 'movie' }),
    makeRustChannel({ title: 'Sky Sports', tvgId: 'live-1', contentType: 'live' }),
  ]);
}

/** Record one finished-or-abandoned watch of a channel. */
async function watch(
  channelId: string,
  channelName: string,
  contentType: ContentType,
  progress?: { endPosition: number; totalDuration: number }
): Promise<void> {
  const sessionId = await userRepository.startViewingSession({
    userId: user.id,
    playlistId: PLAYLIST_ID,
    channelId,
    channelName,
    contentType,
    totalDuration: progress?.totalDuration,
  });
  const endPosition = progress?.endPosition ?? 0;
  await userRepository.endViewingSession(sessionId, endPosition, endPosition, false);
}

beforeEach(async () => {
  jest.useFakeTimers();
  await resetTestDatabases();
  resetStores(useUserStore, usePlaylistStore, useFirstPageCacheStore);

  db = (await getRustDatabase()) as unknown as FakeDb;
  seedCatalogue();
  // The poster memo is module state, deliberately outliving a single mount.
  clearPosterCache();

  user = await userRepository.createUser({ username: 'Alice' });
  useUserStore.setState({ currentUser: user });
  usePlaylistStore.setState({ activePlaylistId: PLAYLIST_ID });

  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('useRecentlyWatched', () => {
  it('asks the history to drop live rows instead of filtering them out here', async () => {
    const getRecentlyWatched = jest.spyOn(userRepository, 'getRecentlyWatched');
    await watch('live-1', 'Sky Sports', 'live');
    await watch('movie-1', 'Blade Runner', 'movie', { endPosition: 600, totalDuration: 6000 });

    const { result } = await renderHook(() => useRecentlyWatched(20));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Live is excluded in SQL; the episodes of one series can only be collapsed
    // after their names are resolved here, which is what the wider page covers.
    expect(getRecentlyWatched).toHaveBeenCalledWith(user.id, PLAYLIST_ID, 40, {
      excludeLive: true,
    });
    expect(result.current.items.map((item) => item.channelId)).toEqual(['movie-1']);
  });

  it('fills the row count even when a binge of one series collapses to a card', async () => {
    // Three episodes of one series (one card) plus two movies: a page of `limit`
    // rows would come back with two cards, not the three that exist.
    for (const [index, name] of ['S01E01', 'S01E02', 'S01E03'].entries()) {
      await watch(`ep-${index + 1}`, `Breaking Bad ${name}`, 'series', {
        endPosition: 60,
        totalDuration: 1200,
      });
      jest.advanceTimersByTime(1000);
    }
    await watch('movie-1', 'Blade Runner', 'movie', { endPosition: 600, totalDuration: 6000 });
    jest.advanceTimersByTime(1000);
    await watch('movie-2', 'Dune', 'movie', { endPosition: 600, totalDuration: 6000 });

    const { result } = await renderHook(() => useRecentlyWatched(3));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.items.map((item) => item.channelId)).toEqual([
      'movie-2',
      'movie-1',
      'ep-3',
    ]);
  });

  it('names a series from its episode title, keeping only the most recent episode', async () => {
    await watch('ep-1', 'Breaking Bad S01E01', 'series', { endPosition: 60, totalDuration: 1200 });
    jest.advanceTimersByTime(1000);
    await watch('ep-2', 'Breaking Bad S01E02', 'series', { endPosition: 90, totalDuration: 1200 });

    const { result } = await renderHook(() => useRecentlyWatched(20));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]).toMatchObject({
      channelId: 'ep-2',
      // Grouped under the series the episode titles strip down to, which is also
      // how the backend groups them — hence the poster lookup below finds one.
      seriesName: 'Breaking Bad',
      seriesPoster: 'https://logos.example.com/bb.png',
    });
  });

  it('shows the stored next episode in place of a finished one', async () => {
    await watch('ep-1', 'Breaking Bad S01E01', 'series', { endPosition: 1180, totalDuration: 1200 });
    await userRepository.setNextEpisode(
      user.id,
      PLAYLIST_ID,
      { channelId: 'ep-1', channelName: 'Breaking Bad S01E01', contentType: 'series' },
      { channelId: 'ep-2', channelName: 'Breaking Bad S01E02' }
    );

    const { result } = await renderHook(() => useRecentlyWatched(20));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.items[0]).toMatchObject({
      channelId: 'ep-2',
      channelName: 'Breaking Bad S01E02',
    });
    // The next episode has not been started, so nothing to resume from.
    expect(result.current.items[0].lastPosition).toBeUndefined();
  });

  it('resolves a series poster once per playlist, and forgets it on a switch', async () => {
    const getSeriesList = jest.spyOn(db, 'getSeriesList');
    await watch('ep-1', 'Breaking Bad S01E01', 'series', { endPosition: 60, totalDuration: 1200 });

    const { result } = await renderHook(() => useRecentlyWatched(20));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(getSeriesList).toHaveBeenCalledTimes(1);

    // A second pass over the same row is served from the memo.
    await act(async () => {
      await result.current.refresh();
    });
    expect(getSeriesList).toHaveBeenCalledTimes(1);

    // Leaving and returning re-queries: a playlist can be re-imported with
    // different posters, and nothing else would ever evict the entry.
    await act(async () => {
      usePlaylistStore.setState({ activePlaylistId: 'pl-2' });
    });
    await act(async () => {
      usePlaylistStore.setState({ activePlaylistId: PLAYLIST_ID });
    });
    await waitFor(() => expect(getSeriesList).toHaveBeenCalledTimes(2));
  });

  it('has nothing to show without an active playlist', async () => {
    usePlaylistStore.setState({ activePlaylistId: null });

    const { result } = await renderHook(() => useRecentlyWatched(20));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.items).toEqual([]);
  });
});

describe('serving the launch pre-fetch', () => {
  const LIMIT = 20;

  /** The key the pre-fetch writes the carousel's rows under. */
  function cacheKey(overrides: Partial<RecentlyWatchedKey> = {}): RecentlyWatchedKey {
    return {
      playlistId: PLAYLIST_ID,
      userId: user.id,
      excludeAdult: false,
      limit: LIMIT,
      version: 0,
      ...overrides,
    };
  }

  /** One pre-fetched card, distinguishable from anything the history holds. */
  const CACHED_CARD: RecentlyWatchedItem = {
    channelId: 'cached-1',
    channelName: 'Cached Movie',
    contentType: 'movie',
    watchCount: 1,
    lastWatchedAt: new Date(0).toISOString(),
  };

  /** Render while recording every frame the carousel was ever handed. */
  async function renderRecordingFrames() {
    const frames: { items: RecentlyWatchedItem[]; isLoading: boolean }[] = [];
    const { result } = await renderHook(() => {
      const state = useRecentlyWatched(LIMIT);
      frames.push({ items: state.items, isLoading: state.isLoading });
      return state;
    });
    return { result, frames };
  }

  it('renders the pre-fetched cards on the first frame, without reloading them', async () => {
    useFirstPageCacheStore.getState().setCachedRecentlyWatched(cacheKey(), [CACHED_CARD]);
    const getRecentlyWatched = jest.spyOn(userRepository, 'getRecentlyWatched');

    const { result, frames } = await renderRecordingFrames();

    expect(result.current.items).toEqual([CACHED_CARD]);
    expect(frames.some((frame) => frame.isLoading)).toBe(false);
    // The pre-fetch *was* this session's first load; repeating it on mount
    // would double the launch budget for rows already on screen.
    expect(getRecentlyWatched).not.toHaveBeenCalled();
  });

  it('refreshes an older slice behind the cards, still without a loading frame', async () => {
    await watch('movie-1', 'Blade Runner', 'movie', { endPosition: 600, totalDuration: 6000 });
    useFirstPageCacheStore.getState().setCachedRecentlyWatched(cacheKey(), [CACHED_CARD]);
    tick(HOME_CACHE_FRESH_MS + 1);

    const { result, frames } = await renderRecordingFrames();

    // The cached cards are what the first frame rendered — no skeleton, no
    // empty carousel — and the refreshed rows land behind them.
    expect(frames[0].items).toEqual([CACHED_CARD]);
    await waitFor(() =>
      expect(result.current.items.map((item) => item.channelId)).toEqual(['movie-1'])
    );
    expect(frames.some((frame) => frame.isLoading)).toBe(false);
    // …and the refreshed rows replace the slice for the next mount.
    expect(useFirstPageCacheStore.getState().getCachedRecentlyWatched(cacheKey())?.value).toEqual(
      result.current.items
    );
  });

  it('joins a pre-fetch that is still in flight instead of repeating it', async () => {
    // The cold-start race: the boot sequence's pre-fetch is still running when
    // the tab group mounts, so the cache is a miss — but the answer is already
    // on its way, and asking again would double the launch budget.
    await watch('movie-1', 'Blade Runner', 'movie', { endPosition: 600, totalDuration: 6000 });
    const getRecentlyWatched = jest.spyOn(userRepository, 'getRecentlyWatched');
    const prefetch = loadRecentlyWatched({
      playlistId: PLAYLIST_ID,
      userId: user.id,
      excludeAdult: false,
      limit: LIMIT,
      version: 0,
    });

    const { result } = await renderRecordingFrames();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await prefetch;

    expect(getRecentlyWatched).toHaveBeenCalledTimes(1);
    expect(result.current.items.map((item) => item.channelId)).toEqual(['movie-1']);
  });

  it('reloads on a pull-to-refresh inside the freshness window', async () => {
    useFirstPageCacheStore.getState().setCachedRecentlyWatched(cacheKey(), [CACHED_CARD]);
    await watch('movie-1', 'Blade Runner', 'movie', { endPosition: 600, totalDuration: 6000 });
    const getRecentlyWatched = jest.spyOn(userRepository, 'getRecentlyWatched');

    const { result } = await renderRecordingFrames();
    // Mounting behind a fresh slice stands on it; only the pull replaces it.
    expect(getRecentlyWatched).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.refresh();
    });

    expect(getRecentlyWatched).toHaveBeenCalledTimes(1);
    expect(result.current.items.map((item) => item.channelId)).toEqual(['movie-1']);
  });

  it('drops the cached cards the moment a refresh asks for new ones', async () => {
    useFirstPageCacheStore.getState().setCachedRecentlyWatched(cacheKey(), [CACHED_CARD]);
    await watch('movie-1', 'Blade Runner', 'movie', { endPosition: 600, totalDuration: 6000 });

    const { result } = await renderRecordingFrames();

    const refreshed = result.current.refresh();

    // Before the load has had a chance to land: a mount while the refresh is
    // still running — or after the user left the page, superseding it — must
    // load rather than serve back the very cards the refresh was replacing.
    expect(useFirstPageCacheStore.getState().getCachedRecentlyWatched(cacheKey())).toBeNull();

    await act(async () => {
      await refreshed;
    });
    expect(useFirstPageCacheStore.getState().getCachedRecentlyWatched(cacheKey())?.value).toEqual(
      result.current.items
    );
  });

  it('loads for itself when the cached rows belong to another user', async () => {
    useFirstPageCacheStore
      .getState()
      .setCachedRecentlyWatched(cacheKey({ userId: 'someone-else' }), [CACHED_CARD]);
    await watch('movie-1', 'Blade Runner', 'movie', { endPosition: 600, totalDuration: 6000 });

    const { result, frames } = await renderRecordingFrames();

    expect(frames[0].isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items.map((item) => item.channelId)).toEqual(['movie-1']);
  });

  it('loads for itself once a finished watch has bumped the history revision', async () => {
    useFirstPageCacheStore.getState().setCachedRecentlyWatched(cacheKey(), [CACHED_CARD]);
    await watch('movie-1', 'Blade Runner', 'movie', { endPosition: 600, totalDuration: 6000 });
    // What `endViewingSession` does through the store: the cached rows predate
    // this watch and must not be served over it.
    useUserStore.setState({ recentlyWatchedVersion: 1 });

    const { result, frames } = await renderRecordingFrames();

    expect(frames[0].isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items.map((item) => item.channelId)).toEqual(['movie-1']);
  });

  it('loads for itself after the playlist was invalidated', async () => {
    useFirstPageCacheStore.getState().setCachedRecentlyWatched(cacheKey(), [CACHED_CARD]);
    useFirstPageCacheStore.getState().invalidatePlaylist(PLAYLIST_ID);
    await watch('movie-1', 'Blade Runner', 'movie', { endPosition: 600, totalDuration: 6000 });

    const { result, frames } = await renderRecordingFrames();

    expect(frames[0].isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items.map((item) => item.channelId)).toEqual(['movie-1']);
  });
});
