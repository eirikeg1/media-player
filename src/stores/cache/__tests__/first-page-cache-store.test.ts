/**
 * Tests for the first-page cache store: synchronous cache reads/writes plus
 * preFetchAll running for real against the Rust-backend fake seeded with the
 * BASIC_M3U fixture.
 */
import { getRustDatabase } from '@/services/rust-channel-service';
import { useFirstPageCacheStore } from '@/stores/cache/first-page-cache-store';
import { makeChannel, makePlaylistMetadata } from '@/test/factories';
import { Database as M3uDatabaseFake, __registerRemoteM3u } from '@/test/fakes/m3u-database-fake';
import { BASIC_M3U, BASIC_M3U_COUNTS } from '@/test/fixtures';
import { resetStores, resetTestDatabases } from '@/test/helpers';

type FakeDb = InstanceType<typeof M3uDatabaseFake>;

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

describe('synchronous cache reads and writes', () => {
  it('returns null/undefined for playlists that were never cached', () => {
    const store = useFirstPageCacheStore.getState();
    expect(store.getCachedChannels('unknown', 'live')).toBeNull();
    expect(store.getCachedSeries('unknown')).toBeNull();
    expect(store.getCachedGroups('unknown', 'movie')).toBeNull();
    expect(store.getExcludeAdult('unknown')).toBeUndefined();
  });

  it('round-trips cached channels per playlist and content type', () => {
    const live = [makeChannel({ name: 'Live 1' })];
    const movies = [makeChannel({ name: 'Movie 1' })];

    useFirstPageCacheStore.getState().setCachedChannels(PLAYLIST_ID, 'live', live, 7);
    useFirstPageCacheStore.getState().setCachedChannels(PLAYLIST_ID, 'movie', movies, 3);

    const store = useFirstPageCacheStore.getState();
    expect(store.getCachedChannels(PLAYLIST_ID, 'live')).toEqual({ items: live, totalCount: 7 });
    expect(store.getCachedChannels(PLAYLIST_ID, 'movie')).toEqual({ items: movies, totalCount: 3 });
    expect(store.getCachedChannels('other-playlist', 'live')).toBeNull();
  });

  it('round-trips cached series and groups', () => {
    const series = [
      { seriesName: 'Breaking Bad', poster: undefined, groupName: 'Drama', episodeCount: 3 },
    ];
    const groups = [{ name: '', channelCount: 7 }, { name: 'Sports', channelCount: 3 }];

    useFirstPageCacheStore.getState().setCachedSeries(PLAYLIST_ID, series, 2);
    useFirstPageCacheStore.getState().setCachedGroups(PLAYLIST_ID, 'live', groups);

    const store = useFirstPageCacheStore.getState();
    expect(store.getCachedSeries(PLAYLIST_ID)).toEqual({ items: series, totalCount: 2 });
    expect(store.getCachedGroups(PLAYLIST_ID, 'live')).toEqual(groups);
    expect(store.getCachedGroups(PLAYLIST_ID, 'series')).toBeNull();
  });
});

describe('preFetchAll', () => {
  it('populates channels, series, and groups from the imported fixture', async () => {
    await importBasicPlaylist();

    await useFirstPageCacheStore.getState().preFetchAll(PLAYLIST_ID, true);

    const store = useFirstPageCacheStore.getState();

    const live = store.getCachedChannels(PLAYLIST_ID, 'live');
    expect(live?.totalCount).toBe(BASIC_M3U_COUNTS.live);
    expect(live?.items.map((c) => c.name)).toContain('TV2 Sport 1 HD');

    // The adult-flagged movie is excluded.
    const movies = store.getCachedChannels(PLAYLIST_ID, 'movie');
    expect(movies?.totalCount).toBe(BASIC_M3U_COUNTS.movies - BASIC_M3U_COUNTS.adult);

    const series = store.getCachedSeries(PLAYLIST_ID);
    expect(series?.totalCount).toBe(2);
    expect(series?.items.map((s) => s.seriesName)).toEqual(['Breaking Bad', 'The Wire']);

    // Group options include the "All" entry first, then sorted group names.
    const liveGroups = store.getCachedGroups(PLAYLIST_ID, 'live');
    expect(liveGroups?.[0]).toEqual({ name: '', channelCount: BASIC_M3U_COUNTS.live });
    expect(liveGroups?.slice(1).map((g) => g.name)).toEqual(['News', 'Norway', 'Sports']);

    const seriesGroups = store.getCachedGroups(PLAYLIST_ID, 'series');
    expect(seriesGroups?.slice(1).map((g) => g.name)).toEqual(['Series | Drama']);

    expect(store.getExcludeAdult(PLAYLIST_ID)).toBe(true);
  });

  it('includes adult content and sorts its group last when excludeAdult is false', async () => {
    await importBasicPlaylist();

    await useFirstPageCacheStore.getState().preFetchAll(PLAYLIST_ID, false);

    const store = useFirstPageCacheStore.getState();
    expect(store.getCachedChannels(PLAYLIST_ID, 'movie')?.totalCount).toBe(
      BASIC_M3U_COUNTS.movies,
    );

    const movieGroups = store.getCachedGroups(PLAYLIST_ID, 'movie');
    expect(movieGroups?.slice(1).map((g) => g.name)).toEqual([
      'Movies | Action',
      'Movies | Drama',
      'Movies | Sci-Fi',
      'Adult | XXX',
    ]);

    expect(store.getExcludeAdult(PLAYLIST_ID)).toBe(false);
  });
});

describe('invalidatePlaylist', () => {
  it('clears only the entries of the invalidated playlist', async () => {
    await importBasicPlaylist();
    await useFirstPageCacheStore.getState().preFetchAll(PLAYLIST_ID, true);
    useFirstPageCacheStore
      .getState()
      .setCachedChannels('other-playlist', 'live', [makeChannel()], 1);

    useFirstPageCacheStore.getState().invalidatePlaylist(PLAYLIST_ID);

    const store = useFirstPageCacheStore.getState();
    expect(store.getCachedChannels(PLAYLIST_ID, 'live')).toBeNull();
    expect(store.getCachedSeries(PLAYLIST_ID)).toBeNull();
    expect(store.getCachedGroups(PLAYLIST_ID, 'live')).toBeNull();
    expect(store.getExcludeAdult(PLAYLIST_ID)).toBeUndefined();

    expect(store.getCachedChannels('other-playlist', 'live')?.totalCount).toBe(1);
  });
});
