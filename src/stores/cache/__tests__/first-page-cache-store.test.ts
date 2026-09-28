/**
 * Tests for the first-page cache store: synchronous cache reads/writes plus
 * preFetchAll running for real against the Rust-backend fake seeded with the
 * BASIC_M3U fixture.
 */
import { RustChannelService, getRustDatabase } from '@/services/rust-channel-service';
import {
  CHANNEL_CACHE_SLOTS,
  HOME_CACHE_SLOT,
  SERIES_CACHE_SLOT,
  useFirstPageCacheStore,
  type HomePrefetchInput,
  type HomeSliceKey,
  type RecentlyWatchedKey,
} from '@/stores/cache/first-page-cache-store';
import { makeChannel, makePlaylistMetadata } from '@/test/factories';
import { Database as M3uDatabaseFake, __registerRemoteM3u } from '@/test/fakes/m3u-database-fake';
import { BASIC_M3U, BASIC_M3U_COUNTS } from '@/test/fixtures';
import { userRepository } from '@/db/user-repository';
import { ensureRecommendationModelLoaded } from '@/services/recommendation-model';
import { resetStores, resetTestDatabases } from '@/test/helpers';
import type { User } from '@/types/user.types';

type FakeDb = InstanceType<typeof M3uDatabaseFake>;

// The taste model is materialized from an asset; what it answers is the
// recommendation-model service's own business, not this store's.
jest.mock('@/services/recommendation-model', () => ({
  ensureRecommendationModelLoaded: jest.fn(async () => true),
}));

const PLAYLIST_ID = 'pl-1';
const PLAYLIST_URL = 'https://iptv.example.com/basic.m3u';

async function importBasicPlaylist(): Promise<void> {
  const db = (await getRustDatabase()) as unknown as FakeDb;
  await db.createPlaylist(makePlaylistMetadata({ id: PLAYLIST_ID, url: PLAYLIST_URL }));
  __registerRemoteM3u(PLAYLIST_URL, BASIC_M3U);
  await db.fetchAndImportPlaylist(PLAYLIST_ID, PLAYLIST_URL);
}

beforeEach(async () => {
  await resetTestDatabases();
  resetStores(useFirstPageCacheStore);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('synchronous cache reads and writes', () => {
  it('returns null/undefined for playlists that were never cached', () => {
    const store = useFirstPageCacheStore.getState();
    expect(store.getCachedChannels('unknown', 'live', true)).toBeNull();
    expect(store.getCachedSeries('unknown', true)).toBeNull();
    expect(store.getCachedGroups('unknown', 'movie', true)).toBeNull();
  });

  it('round-trips cached channels per playlist and content type', () => {
    const live = [makeChannel({ name: 'Live 1' })];
    const movies = [makeChannel({ name: 'Movie 1' })];

    useFirstPageCacheStore.getState().setCachedChannels(PLAYLIST_ID, 'live', live, 7, true);
    useFirstPageCacheStore.getState().setCachedChannels(PLAYLIST_ID, 'movie', movies, 3, true);

    const store = useFirstPageCacheStore.getState();
    expect(store.getCachedChannels(PLAYLIST_ID, 'live', true)).toEqual({
      items: live,
      totalCount: 7,
      excludeAdult: true,
    });
    expect(store.getCachedChannels(PLAYLIST_ID, 'movie', true)).toEqual({
      items: movies,
      totalCount: 3,
      excludeAdult: true,
    });
    expect(store.getCachedChannels('other-playlist', 'live', true)).toBeNull();
  });

  it('reads as a miss for a slot cached under a different adult filter', () => {
    const live = [makeChannel({ name: 'Live 1' })];
    const series = [
      { seriesName: 'Breaking Bad', poster: undefined, groupName: 'Drama', episodeCount: 3 },
    ];
    const groups = [{ name: '', channelCount: 7 }];

    useFirstPageCacheStore.getState().setCachedChannels(PLAYLIST_ID, 'live', live, 7, false);
    useFirstPageCacheStore.getState().setCachedSeries(PLAYLIST_ID, series, 2, false);
    useFirstPageCacheStore.getState().setCachedGroups(PLAYLIST_ID, 'live', groups, false);

    const store = useFirstPageCacheStore.getState();
    expect(store.getCachedChannels(PLAYLIST_ID, 'live', true)).toBeNull();
    expect(store.getCachedSeries(PLAYLIST_ID, true)).toBeNull();
    expect(store.getCachedGroups(PLAYLIST_ID, 'live', true)).toBeNull();

    // The slot itself is untouched: the setting it was written under still reads it.
    expect(store.getCachedChannels(PLAYLIST_ID, 'live', false)?.totalCount).toBe(7);
  });

  it('round-trips cached series and groups', () => {
    const series = [
      { seriesName: 'Breaking Bad', poster: undefined, groupName: 'Drama', episodeCount: 3 },
    ];
    const groups = [{ name: '', channelCount: 7 }, { name: 'Sports', channelCount: 3 }];

    useFirstPageCacheStore.getState().setCachedSeries(PLAYLIST_ID, series, 2, true);
    useFirstPageCacheStore.getState().setCachedGroups(PLAYLIST_ID, 'live', groups, true);

    const store = useFirstPageCacheStore.getState();
    expect(store.getCachedSeries(PLAYLIST_ID, true)).toEqual({
      items: series,
      totalCount: 2,
      excludeAdult: true,
    });
    expect(store.getCachedGroups(PLAYLIST_ID, 'live', true)).toEqual(groups);
    expect(store.getCachedGroups(PLAYLIST_ID, 'series', true)).toBeNull();
  });
});

describe('preFetchAll', () => {
  it('populates channels, series, and groups from the imported fixture', async () => {
    await importBasicPlaylist();

    await useFirstPageCacheStore.getState().preFetchAll(PLAYLIST_ID, true);

    const store = useFirstPageCacheStore.getState();

    const live = store.getCachedChannels(PLAYLIST_ID, 'live', true);
    expect(live?.totalCount).toBe(BASIC_M3U_COUNTS.live);
    expect(live?.items.map((c) => c.name)).toContain('TV2 Sport 1 HD');

    // The adult-flagged movie is excluded.
    const movies = store.getCachedChannels(PLAYLIST_ID, 'movie', true);
    expect(movies?.totalCount).toBe(BASIC_M3U_COUNTS.movies - BASIC_M3U_COUNTS.adult);

    const series = store.getCachedSeries(PLAYLIST_ID, true);
    expect(series?.totalCount).toBe(2);
    expect(series?.items.map((s) => s.seriesName)).toEqual(['Breaking Bad', 'The Wire']);

    // Group options include the "All" entry first, then sorted group names.
    const liveGroups = store.getCachedGroups(PLAYLIST_ID, 'live', true);
    expect(liveGroups?.[0]).toEqual({ name: '', channelCount: BASIC_M3U_COUNTS.live });
    expect(liveGroups?.slice(1).map((g) => g.name)).toEqual(['News', 'Norway', 'Sports']);

    const seriesGroups = store.getCachedGroups(PLAYLIST_ID, 'series', true);
    expect(seriesGroups?.slice(1).map((g) => g.name)).toEqual(['Series | Drama']);
  });

  it('includes adult content and sorts its group last when excludeAdult is false', async () => {
    await importBasicPlaylist();

    await useFirstPageCacheStore.getState().preFetchAll(PLAYLIST_ID, false);

    const store = useFirstPageCacheStore.getState();
    expect(store.getCachedChannels(PLAYLIST_ID, 'movie', false)?.totalCount).toBe(
      BASIC_M3U_COUNTS.movies,
    );

    const movieGroups = store.getCachedGroups(PLAYLIST_ID, 'movie', false);
    expect(movieGroups?.slice(1).map((g) => g.name)).toEqual([
      'Movies | Action',
      'Movies | Drama',
      'Movies | Sci-Fi',
      'Adult | XXX',
    ]);
  });

  it('writes every slot with the query its tab defaults to', async () => {
    await importBasicPlaylist();
    const channelSpy = jest.spyOn(RustChannelService, 'getChannelsFilteredWithCount');
    const seriesSpy = jest.spyOn(RustChannelService, 'getSeriesList');

    await useFirstPageCacheStore.getState().preFetchAll(PLAYLIST_ID, true);

    const liveQuery = channelSpy.mock.calls.find((call) => call[1]?.contentType === 'live')?.[1];
    const movieQuery = channelSpy.mock.calls.find((call) => call[1]?.contentType === 'movie')?.[1];

    // The Live tab defaults to playlist order: pre-fetching a title-sorted page
    // would leave the slot unreadable by the very screen it was fetched for.
    expect(liveQuery?.sortBy).toBeUndefined();
    expect(liveQuery?.limit).toBe(CHANNEL_CACHE_SLOTS.live.pageSize);
    expect(liveQuery?.sortOrder).toBe(CHANNEL_CACHE_SLOTS.live.sortOrder);

    // The Movies tab defaults to alphabetical.
    expect(movieQuery?.sortBy).toBe(CHANNEL_CACHE_SLOTS.movie.sortBy);
    expect(movieQuery?.limit).toBe(CHANNEL_CACHE_SLOTS.movie.pageSize);

    expect(seriesSpy.mock.calls[0]?.[1]).toMatchObject({
      limit: SERIES_CACHE_SLOT.pageSize,
      sortOrder: SERIES_CACHE_SLOT.sortOrder,
    });
  });

  it('keeps the slices that succeeded when one query fails', async () => {
    await importBasicPlaylist();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest
      .spyOn(RustChannelService, 'getSeriesList')
      .mockRejectedValueOnce(new Error('series query failed'));

    await useFirstPageCacheStore.getState().preFetchAll(PLAYLIST_ID, true);

    const store = useFirstPageCacheStore.getState();
    // Only the failed slice is missing; the rest were cached, so the other tabs
    // still open instantly.
    expect(store.getCachedSeries(PLAYLIST_ID, true)).toBeNull();
    expect(store.getCachedChannels(PLAYLIST_ID, 'live', true)?.totalCount).toBe(
      BASIC_M3U_COUNTS.live,
    );
    expect(store.getCachedGroups(PLAYLIST_ID, 'series', true)).not.toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it('drops slices cached under a different adult filter', async () => {
    await importBasicPlaylist();
    await useFirstPageCacheStore.getState().preFetchAll(PLAYLIST_ID, false);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest
      .spyOn(RustChannelService, 'getSeriesList')
      .mockRejectedValueOnce(new Error('series query failed'));

    await useFirstPageCacheStore.getState().preFetchAll(PLAYLIST_ID, true);

    const store = useFirstPageCacheStore.getState();
    // Serving the unfiltered series list under excludeAdult would leak adult
    // content, so the stale slice is dropped rather than kept.
    expect(store.getCachedSeries(PLAYLIST_ID, true)).toBeNull();
    expect(store.getCachedChannels(PLAYLIST_ID, 'live', true)?.totalCount).toBe(
      BASIC_M3U_COUNTS.live,
    );
    expect(warn).toHaveBeenCalled();
  });
});

describe('the home slot', () => {
  const RECENTLY_WATCHED_KEY: RecentlyWatchedKey = {
    playlistId: PLAYLIST_ID,
    userId: 'u1',
    excludeAdult: true,
    limit: HOME_CACHE_SLOT.recentlyWatchedLimit,
    version: 0,
  };
  const CONTENT_KEY: HomeSliceKey = {
    playlistId: PLAYLIST_ID,
    userId: 'u1',
    excludeAdult: true,
    limit: HOME_CACHE_SLOT.contentLimit,
  };

  it('round-trips each half and refuses a key it was not built for', () => {
    const cards = [
      {
        channelId: 'movie-1',
        channelName: 'Blade Runner',
        contentType: 'movie' as const,
        watchCount: 1,
        lastWatchedAt: new Date(0).toISOString(),
      },
    ];
    const batch = { movies: [makeChannel({ name: 'Arrival' })], series: [], mode: 'popular' as const };

    const store = useFirstPageCacheStore.getState();
    store.setCachedRecentlyWatched(RECENTLY_WATCHED_KEY, cards);
    store.setCachedHomeContent(CONTENT_KEY, batch);

    expect(store.getCachedRecentlyWatched(RECENTLY_WATCHED_KEY)?.value).toEqual(cards);
    expect(store.getCachedHomeContent(CONTENT_KEY)?.value).toEqual(batch);

    // Each half is written on its own, and neither serves anyone else: another
    // user's history, another adult filter, a shorter row, or rows from before
    // the last finished watch would all put the wrong thing on screen.
    expect(store.getCachedRecentlyWatched({ ...RECENTLY_WATCHED_KEY, version: 1 })).toBeNull();
    expect(store.getCachedRecentlyWatched({ ...RECENTLY_WATCHED_KEY, userId: 'u2' })).toBeNull();
    expect(store.getCachedHomeContent({ ...CONTENT_KEY, excludeAdult: false })).toBeNull();
    expect(store.getCachedHomeContent({ ...CONTENT_KEY, limit: 5 })).toBeNull();
  });

  it('invalidates one half without disturbing the other', () => {
    const cards = [
      {
        channelId: 'movie-1',
        channelName: 'Blade Runner',
        contentType: 'movie' as const,
        watchCount: 1,
        lastWatchedAt: new Date(0).toISOString(),
      },
    ];
    const batch = { movies: [makeChannel({ name: 'Arrival' })], series: [], mode: 'popular' as const };

    const store = useFirstPageCacheStore.getState();
    store.setCachedRecentlyWatched(RECENTLY_WATCHED_KEY, cards);
    store.setCachedHomeContent(CONTENT_KEY, batch);

    // What an explicit refresh of the discover rows does: the carousel is a
    // separate load that nobody asked to replace.
    store.invalidateHomeSlice(PLAYLIST_ID, 'content');

    expect(store.getCachedHomeContent(CONTENT_KEY)).toBeNull();
    expect(store.getCachedRecentlyWatched(RECENTLY_WATCHED_KEY)?.value).toEqual(cards);
  });

  it('is filled by preFetchAll with the rows the home screen asks for', async () => {
    await importBasicPlaylist();
    const user: User = await userRepository.createUser({ username: 'Alice' });
    const session = await userRepository.startViewingSession({
      userId: user.id,
      playlistId: PLAYLIST_ID,
      channelId: 'movie-1',
      channelName: 'Blade Runner',
      contentType: 'movie',
    });
    await userRepository.endViewingSession(session, 600, 600, false);

    const home: HomePrefetchInput = {
      userId: user.id,
      reactions: {},
      recentlyWatchedVersion: 0,
    };
    await useFirstPageCacheStore.getState().preFetchAll(PLAYLIST_ID, false, [], home);

    const store = useFirstPageCacheStore.getState();
    const key = { playlistId: PLAYLIST_ID, userId: user.id, excludeAdult: false };
    // The carousel and the discover rows are in hand before the loading screen
    // drops, under exactly the keys the home hooks read.
    expect(
      store
        .getCachedRecentlyWatched({
          ...key,
          limit: HOME_CACHE_SLOT.recentlyWatchedLimit,
          version: 0,
        })
        ?.value.map((item) => item.channelId)
    ).toEqual(['movie-1']);
    expect(
      store.getCachedHomeContent({ ...key, limit: HOME_CACHE_SLOT.contentLimit })?.value.movies
    ).not.toHaveLength(0);
    expect(ensureRecommendationModelLoaded).toHaveBeenCalled();
  });

  it('is left alone for a launch with no signed-in user', async () => {
    await importBasicPlaylist();

    await useFirstPageCacheStore.getState().preFetchAll(PLAYLIST_ID, true);

    expect(
      useFirstPageCacheStore.getState().getCachedRecentlyWatched(RECENTLY_WATCHED_KEY)
    ).toBeNull();
    expect(useFirstPageCacheStore.getState().getCachedHomeContent(CONTENT_KEY)).toBeNull();
  });

  it('keeps the catalogue slices when a home query fails', async () => {
    await importBasicPlaylist();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest
      .spyOn(userRepository, 'getRecentlyWatched')
      .mockRejectedValueOnce(new Error('history query failed'));

    await useFirstPageCacheStore
      .getState()
      .preFetchAll(PLAYLIST_ID, true, [], { userId: 'u1', reactions: {}, recentlyWatchedVersion: 0 });

    const store = useFirstPageCacheStore.getState();
    // The carousel falls back to its own first load, with its own skeleton;
    // nothing else on the launch path is affected.
    expect(store.getCachedRecentlyWatched(RECENTLY_WATCHED_KEY)).toBeNull();
    expect(store.getCachedHomeContent(CONTENT_KEY)).not.toBeNull();
    expect(store.getCachedChannels(PLAYLIST_ID, 'live', true)?.totalCount).toBe(
      BASIC_M3U_COUNTS.live,
    );
    expect(warn).toHaveBeenCalled();
  });
});

describe('invalidatePlaylist', () => {
  it('clears only the entries of the invalidated playlist', async () => {
    await importBasicPlaylist();
    await useFirstPageCacheStore.getState().preFetchAll(PLAYLIST_ID, true, [], {
      userId: 'u1',
      reactions: {},
      recentlyWatchedVersion: 0,
    });
    useFirstPageCacheStore
      .getState()
      .setCachedChannels('other-playlist', 'live', [makeChannel()], 1, true);

    useFirstPageCacheStore.getState().invalidatePlaylist(PLAYLIST_ID);

    const store = useFirstPageCacheStore.getState();
    expect(store.getCachedChannels(PLAYLIST_ID, 'live', true)).toBeNull();
    expect(store.getCachedSeries(PLAYLIST_ID, true)).toBeNull();
    expect(store.getCachedGroups(PLAYLIST_ID, 'live', true)).toBeNull();
    expect(
      store.getCachedHomeContent({
        playlistId: PLAYLIST_ID,
        userId: 'u1',
        excludeAdult: true,
        limit: HOME_CACHE_SLOT.contentLimit,
      })
    ).toBeNull();

    expect(store.getCachedChannels('other-playlist', 'live', true)?.totalCount).toBe(1);
  });
});
