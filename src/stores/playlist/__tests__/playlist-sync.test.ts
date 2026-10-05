/**
 * The shared "sync this playlist" / "sync its guide" implementation, against
 * the real repository (SQLite fake) and the Rust-backend fake. The store is
 * either initialised with the playlist (the app is alive) or left empty (a
 * headless background launch, where no boot sequence has run).
 */
import { playlistRepository } from '@/db/playlist-repository';
import { RustChannelService } from '@/services/rust-channel-service';
import { subscribeToCatalogueRefreshes, type CatalogueRefresh } from '@/stores/playlist/catalogue-events';
import { useImportProgressStore } from '@/stores/playlist/import-progress-store';
import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import {
  isCatalogueSyncRunning,
  syncPlaylistChannels,
  syncPlaylistGuide,
} from '@/stores/playlist/playlist-sync';
import { useFirstPageCacheStore } from '@/stores/cache/first-page-cache-store';
import { makePlaylist } from '@/test/factories';
import { __registerRemoteM3u, __registerRemoteXmltv } from '@/test/fakes/m3u-database-fake';
import { BASIC_M3U, BASIC_M3U_COUNTS, BASIC_XMLTV } from '@/test/fixtures';
import { resetStores, resetTestDatabases } from '@/test/helpers';
import type { Playlist } from '@/types/playlist.types';

/** The guide the fixture channels reference through their tvg-url. */
const GUIDE_URL = 'https://epg.example.com/guide.xml';
const LONG_AGO = new Date('2026-01-01T00:00:00Z');

async function storedPlaylist(): Promise<Playlist> {
  const playlist = makePlaylist({ lastFetchedAt: LONG_AGO, lastEpgFetchedAt: LONG_AGO });
  await playlistRepository.create(playlist);
  __registerRemoteM3u(playlist.url, BASIC_M3U);
  return playlist;
}

let events: CatalogueRefresh[];
let unsubscribe: () => void;

beforeEach(async () => {
  await resetTestDatabases();
  resetStores(usePlaylistStore, useImportProgressStore, useFirstPageCacheStore);
  events = [];
  unsubscribe = subscribeToCatalogueRefreshes((event) => events.push(event));
});

afterEach(() => {
  unsubscribe();
  jest.restoreAllMocks();
});

describe('syncPlaylistChannels', () => {
  it('imports and stamps the row, and patches an initialised store', async () => {
    const playlist = await storedPlaylist();
    usePlaylistStore.setState({ playlists: [playlist], isInitialized: true });
    const invalidate = jest.spyOn(useFirstPageCacheStore.getState(), 'invalidatePlaylist');

    const updated = await syncPlaylistChannels(playlist.id);

    expect(await RustChannelService.countChannelsByPlaylist(playlist.id)).toBe(
      BASIC_M3U_COUNTS.total,
    );
    const stored = await playlistRepository.getById(playlist.id);
    expect(stored?.channelCount).toBe(BASIC_M3U_COUNTS.total);
    expect(stored?.lastFetchedAt!.getTime()).toBeGreaterThan(LONG_AGO.getTime());
    expect(updated).toEqual(stored);

    expect(usePlaylistStore.getState().playlists).toEqual([stored]);
    expect(invalidate).toHaveBeenCalledWith(playlist.id);
    expect(events).toEqual([{ part: 'channels', playlist: stored }]);
  });

  it('works headless, with no store initialised', async () => {
    const playlist = await storedPlaylist();
    expect(usePlaylistStore.getState().isInitialized).toBe(false);

    await syncPlaylistChannels(playlist.id);

    const stored = await playlistRepository.getById(playlist.id);
    expect(stored?.lastFetchedAt!.getTime()).toBeGreaterThan(LONG_AGO.getTime());
    // Nothing to patch: the next `loadPlaylists` reads the stamp from the row.
    expect(usePlaylistStore.getState().playlists).toEqual([]);
    expect(events).toHaveLength(1);
  });

  it('records nothing when the import fails', async () => {
    const playlist = makePlaylist({ lastFetchedAt: LONG_AGO });
    await playlistRepository.create(playlist); // no remote registered for its URL

    await expect(syncPlaylistChannels(playlist.id)).rejects.toThrow();

    expect((await playlistRepository.getById(playlist.id))?.lastFetchedAt).toEqual(LONG_AGO);
    expect(events).toEqual([]);
  });

  it('rejects an unknown playlist', async () => {
    await expect(syncPlaylistChannels('missing')).rejects.toThrow('Playlist not found');
  });

  it('counts as a running sync until it settles', async () => {
    const playlist = await storedPlaylist();

    const run = syncPlaylistChannels(playlist.id);
    expect(isCatalogueSyncRunning()).toBe(true);
    await run;

    expect(isCatalogueSyncRunning()).toBe(false);
  });
});

describe('syncPlaylistGuide', () => {
  async function playlistWithChannels(): Promise<Playlist> {
    const playlist = await storedPlaylist();
    await RustChannelService.fetchAndImportPlaylist(playlist.id, playlist.name, playlist.url);
    return playlist;
  }

  it('downloads the guide and stamps the row and an initialised store', async () => {
    const playlist = await playlistWithChannels();
    __registerRemoteXmltv(GUIDE_URL, BASIC_XMLTV);
    usePlaylistStore.setState({ playlists: [playlist], isInitialized: true });

    await syncPlaylistGuide(playlist.id);

    const stored = await playlistRepository.getById(playlist.id);
    expect(stored?.lastEpgFetchedAt!.getTime()).toBeGreaterThan(LONG_AGO.getTime());
    expect(usePlaylistStore.getState().playlists[0].lastEpgFetchedAt).toEqual(
      stored?.lastEpgFetchedAt,
    );
    expect(events).toEqual([{ part: 'guide', playlist: stored }]);
  });

  it('does not stamp a guide that failed to download', async () => {
    // The channels reference the guide, but nothing serves it.
    const playlist = await playlistWithChannels();

    await expect(syncPlaylistGuide(playlist.id)).rejects.toThrow(/failed to download/);

    expect((await playlistRepository.getById(playlist.id))?.lastEpgFetchedAt).toEqual(LONG_AGO);
    expect(events).toEqual([]);
    expect(isCatalogueSyncRunning()).toBe(false);
  });
});
