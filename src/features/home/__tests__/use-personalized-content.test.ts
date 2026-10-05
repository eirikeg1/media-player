/**
 * Lifecycle of the home page's personalized discover rows: read the stored
 * batch, precompute the next one in the background, and feed the engine the
 * signals gathered from the user's stores and watch history.
 *
 * The taste model itself is mocked out — asset materialization is covered by
 * the recommendation-model service tests — so these assertions are about what
 * the hook sends and what it does with the answer.
 */
import { userRepository } from '@/db/user-repository';
import { usePersonalizedContent } from '@/features/home/hooks/use-personalized-content';
import { ensureRecommendationModelLoaded } from '@/services/recommendation-model';
import { getRustDatabase } from '@/services/rust-channel-service';
import { HOME_CACHE_FRESH_MS, useFirstPageCacheStore, type HomeSliceKey } from '@/stores/cache';
import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import { useUserStore } from '@/stores/user/user-store';
import { makeChannel, makeRustChannel } from '@/test/factories';
import { Database as M3uDatabaseFake } from '@/test/fakes/m3u-database-fake';
import { resetStores, resetTestDatabases } from '@/test/helpers';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { Channel } from '@/types/playlist.types';
import type { User } from '@/types/user.types';

jest.mock('@/services/recommendation-model', () => ({
  ensureRecommendationModelLoaded: jest.fn(),
}));

const modelLoaded = jest.mocked(ensureRecommendationModelLoaded);

type FakeDb = InstanceType<typeof M3uDatabaseFake>;

const PLAYLIST_ID = 'pl-1';
const LIMIT = 10;

let db: FakeDb;
let user: User;

/** Seed two movies and one two-episode series into the Rust-backend fake. */
function seedCatalogue(): void {
  db.__seedChannels(PLAYLIST_ID, [
    makeRustChannel({ title: 'Blade Runner', tvgId: 'movie-1', contentType: 'movie' }),
    makeRustChannel({ title: 'Arrival', tvgId: 'movie-2', contentType: 'movie' }),
    makeRustChannel({
      title: 'Breaking Bad S01E01',
      tvgId: 'ep-1',
      tvgName: 'Breaking Bad S01E01',
      contentType: 'series',
    }),
    makeRustChannel({
      title: 'Breaking Bad S01E02',
      tvgId: 'ep-2',
      tvgName: 'Breaking Bad S01E02',
      contentType: 'series',
    }),
  ]);
}

/** Record a viewing session so the channel lands in the seen set. */
async function watch(
  channelId: string,
  channelName: string,
  contentType: 'movie' | 'series',
  completed = true
) {
  const sessionId = await userRepository.startViewingSession({
    userId: user.id,
    playlistId: PLAYLIST_ID,
    channelId,
    channelName,
    contentType,
  });
  await userRepository.endViewingSession(sessionId, 120, 120, completed);
}

beforeEach(async () => {
  await resetTestDatabases();
  resetStores(useUserStore, usePlaylistStore, useFirstPageCacheStore);
  modelLoaded.mockResolvedValue(true);

  db = (await getRustDatabase()) as unknown as FakeDb;
  seedCatalogue();

  user = await userRepository.createUser({ username: 'Alice' });
  useUserStore.setState({ currentUser: user });
  usePlaylistStore.setState({ activePlaylistId: PLAYLIST_ID });

  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('usePersonalizedContent', () => {
  it('serves the stored batch and precomputes the next one in the background', async () => {
    const regenerateMovies = jest.spyOn(db, 'regeneratePersonalizedMovieRecommendations');
    const regenerateSeries = jest.spyOn(db, 'regeneratePersonalizedSeriesRecommendations');

    const { result } = await renderHook(() => usePersonalizedContent(LIMIT));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.movies.map((movie) => movie.name)).toEqual(['Blade Runner', 'Arrival']);
    expect(result.current.series.map((entry) => entry.seriesName)).toEqual(['Breaking Bad']);

    await waitFor(() => expect(regenerateMovies).toHaveBeenCalledTimes(1));
    expect(regenerateSeries).toHaveBeenCalledTimes(1);
  });

  it('sends the reactions, favorites and seen set as signals', async () => {
    useUserStore.setState({
      contentReactions: { 'movie-1': 1, 'series:Fargo': -1 },
      favoriteChannels: ['movie-2'],
    });
    await watch('movie-1', 'Blade Runner', 'movie');
    await watch('ep-1', 'Breaking Bad S01E01', 'series');

    const getMovies = jest.spyOn(db, 'getPersonalizedMovieRecommendations');

    const { result } = await renderHook(() => usePersonalizedContent(LIMIT));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // `false` is the user's parental-control setting, i.e. adult content is
    // not excluded for a default profile.
    expect(getMovies).toHaveBeenCalledWith(PLAYLIST_ID, user.id, false, LIMIT, {
      reactions: [
        { id: 'movie-1', kind: 'movie', weight: 1 },
        { id: 'Fargo', kind: 'series', weight: -1 },
      ],
      favorites: [{ id: 'movie-2', kind: 'movie' }],
      // One finished episode is too few to call "Breaking Bad" watched.
      watched: [{ id: 'movie-1', kind: 'movie' }],
      seenChannelIds: ['movie-1', 'ep-1'],
      seenSeriesNames: ['Breaking Bad'],
    });
  });

  it('sends a series as watched once enough episodes are finished', async () => {
    await watch('ep-1', 'Breaking Bad S01E01', 'series');
    await watch('ep-2', 'Breaking Bad S01E02', 'series');
    await watch('ep-3', 'Breaking Bad S01E03', 'series');
    await watch('movie-1', 'Blade Runner', 'movie', false);

    const getMovies = jest.spyOn(db, 'getPersonalizedMovieRecommendations');

    const { result } = await renderHook(() => usePersonalizedContent(LIMIT));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const [, , , , signals] = getMovies.mock.calls[0];
    expect(signals.watched).toEqual([{ id: 'Breaking Bad', kind: 'series' }]);
  });

  it('re-reads and regenerates again on refresh', async () => {
    const getMovies = jest.spyOn(db, 'getPersonalizedMovieRecommendations');
    const regenerateMovies = jest.spyOn(db, 'regeneratePersonalizedMovieRecommendations');

    const { result } = await renderHook(() => usePersonalizedContent(LIMIT));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await waitFor(() => expect(regenerateMovies).toHaveBeenCalledTimes(1));

    await result.current.refresh();

    expect(getMovies).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(regenerateMovies).toHaveBeenCalledTimes(2));
  });

  it('is personalized when the model is loaded and the user has taste signals', async () => {
    useUserStore.setState({ favoriteChannels: ['movie-2'] });

    const { result } = await renderHook(() => usePersonalizedContent(LIMIT));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.mode).toBe('personalized');
  });

  it('is personalized from watch history alone once enough titles are finished', async () => {
    await watch('movie-1', 'Blade Runner', 'movie');
    await watch('movie-2', 'Arrival', 'movie');
    await watch('movie-3', 'Dune', 'movie');
    await watch('movie-4', 'Sicario', 'movie');

    const { result } = await renderHook(() => usePersonalizedContent(LIMIT));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.mode).toBe('personalized');
  });

  it('is random without a model, even with taste signals', async () => {
    modelLoaded.mockResolvedValue(false);
    useUserStore.setState({ favoriteChannels: ['movie-2'] });

    const { result } = await renderHook(() => usePersonalizedContent(LIMIT));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.mode).toBe('random');
    // The engine still answers, from its random fallback.
    expect(result.current.movies).toHaveLength(2);
  });

  it('is popular for a user who has expressed too little taste', async () => {
    await watch('movie-1', 'Blade Runner', 'movie');

    const { result } = await renderHook(() => usePersonalizedContent(LIMIT));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.mode).toBe('popular');
  });

  it('stays empty until a playlist is active', async () => {
    usePlaylistStore.setState({ activePlaylistId: null });
    const getMovies = jest.spyOn(db, 'getPersonalizedMovieRecommendations');

    const { result } = await renderHook(() => usePersonalizedContent(LIMIT));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.movies).toEqual([]);
    expect(result.current.series).toEqual([]);
    expect(getMovies).not.toHaveBeenCalled();
  });

  it('recovers from a generation failure by showing nothing', async () => {
    jest
      .spyOn(db, 'getPersonalizedMovieRecommendations')
      .mockRejectedValue(new Error('generation failed'));

    const { result } = await renderHook(() => usePersonalizedContent(LIMIT));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.movies).toEqual([]);
    expect(result.current.series).toEqual([]);
    expect(result.current.mode).toBe('random');
  });
});

describe('serving the launch pre-fetch', () => {
  /** The key the pre-fetch writes the discover rows under. */
  function cacheKey(overrides: Partial<HomeSliceKey> = {}): HomeSliceKey {
    return { playlistId: PLAYLIST_ID, userId: user.id, excludeAdult: false, limit: LIMIT, ...overrides };
  }

  /** A pre-fetched batch, distinguishable from anything the catalogue holds. */
  const CACHED_BATCH = {
    movies: [makeChannel({ name: 'Cached Movie' })],
    series: [],
    mode: 'personalized' as const,
  };

  /** Render while recording every frame the discover rows were ever handed. */
  async function renderRecordingFrames() {
    const frames: { movies: Channel[]; isLoading: boolean }[] = [];
    const { result } = await renderHook(() => {
      const state = usePersonalizedContent(LIMIT);
      frames.push({ movies: state.movies, isLoading: state.isLoading });
      return state;
    });
    return { result, frames };
  }

  it('renders the pre-fetched batch on the first frame, without reloading it', async () => {
    useFirstPageCacheStore.getState().setCachedHomeContent(cacheKey(), CACHED_BATCH);
    const getMovies = jest.spyOn(db, 'getPersonalizedMovieRecommendations');

    const { result, frames } = await renderRecordingFrames();

    expect(result.current.movies.map((movie) => movie.name)).toEqual(['Cached Movie']);
    expect(result.current.mode).toBe('personalized');
    expect(frames.some((frame) => frame.isLoading)).toBe(false);
    // The pre-fetch *was* this session's first read; repeating it on mount
    // would regenerate a batch for rows already on screen.
    expect(getMovies).not.toHaveBeenCalled();
  });

  it('refreshes an older batch behind the rows, still without a loading frame', async () => {
    useFirstPageCacheStore.getState().setCachedHomeContent(cacheKey(), CACHED_BATCH);
    // Past the freshness window: this suite runs on the real clock, so the
    // slice is aged by moving the clock rather than by waiting a minute.
    const writtenAt = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(writtenAt + HOME_CACHE_FRESH_MS + 1);

    const { result, frames } = await renderRecordingFrames();

    expect(frames[0].movies.map((movie) => movie.name)).toEqual(['Cached Movie']);
    await waitFor(() =>
      expect(result.current.movies.map((movie) => movie.name)).toEqual(['Blade Runner', 'Arrival'])
    );
    expect(frames.some((frame) => frame.isLoading)).toBe(false);
    // …and the refreshed batch replaces the slice for the next mount.
    expect(
      useFirstPageCacheStore.getState().getCachedHomeContent(cacheKey())?.value.movies
    ).toEqual(result.current.movies);
  });

  it('reloads on a pull-to-refresh inside the freshness window', async () => {
    useFirstPageCacheStore.getState().setCachedHomeContent(cacheKey(), CACHED_BATCH);
    const getMovies = jest.spyOn(db, 'getPersonalizedMovieRecommendations');
    const regenerateMovies = jest.spyOn(db, 'regeneratePersonalizedMovieRecommendations');

    const { result } = await renderRecordingFrames();
    // Mounting behind a fresh slice stands on it; only the pull replaces it.
    expect(getMovies).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.refresh();
    });

    expect(getMovies).toHaveBeenCalledTimes(1);
    expect(result.current.movies.map((movie) => movie.name)).toEqual(['Blade Runner', 'Arrival']);
    // …and the next batch is precomputed again, as every read does.
    await waitFor(() => expect(regenerateMovies).toHaveBeenCalledTimes(1));
  });

  it('drops the cached batch the moment a refresh asks for a new one', async () => {
    useFirstPageCacheStore.getState().setCachedHomeContent(cacheKey(), CACHED_BATCH);

    const { result } = await renderRecordingFrames();

    const refreshed = result.current.refresh();

    // Before the load has had a chance to land: a mount while the refresh is
    // still running — or after the user left the page, superseding it — must
    // load rather than serve back the very batch the refresh was replacing.
    expect(useFirstPageCacheStore.getState().getCachedHomeContent(cacheKey())).toBeNull();

    await act(async () => {
      await refreshed;
    });
    expect(result.current.movies.map((movie) => movie.name)).toEqual(['Blade Runner', 'Arrival']);
    expect(
      useFirstPageCacheStore.getState().getCachedHomeContent(cacheKey())?.value.movies
    ).toEqual(result.current.movies);
  });

  it('loads for itself when the cached batch belongs to another user', async () => {
    useFirstPageCacheStore
      .getState()
      .setCachedHomeContent(cacheKey({ userId: 'someone-else' }), CACHED_BATCH);

    const { result, frames } = await renderRecordingFrames();

    expect(frames[0].isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.movies.map((movie) => movie.name)).toEqual(['Blade Runner', 'Arrival']);
  });

  it('loads for itself after the playlist was invalidated', async () => {
    useFirstPageCacheStore.getState().setCachedHomeContent(cacheKey(), CACHED_BATCH);
    useFirstPageCacheStore.getState().invalidatePlaylist(PLAYLIST_ID);

    const { result, frames } = await renderRecordingFrames();

    expect(frames[0].isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.movies.map((movie) => movie.name)).toEqual(['Blade Runner', 'Arrival']);
  });
});
