/**
 * Integration tests for the EPG sync scheduler.
 *
 * The scheduler polls the playlist store every 60 seconds and, for overdue
 * playlists, runs the real `EpgService.detectAndFetchEpgSources` against the
 * Rust-backend fake (channels imported from BASIC_M3U carry the guide's
 * tvg-url) and persists `lastEpgFetchedAt` in the repository and store.
 */
import { epgSyncScheduler } from '../epg-sync-scheduler';
import { EpgService } from '../epg-service';
import { RustChannelService } from '../rust-channel-service';
import { playlistRepository } from '@/db/playlist-repository';
import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import { __registerRemoteM3u, __registerRemoteXmltv } from '@/test/fakes/m3u-database-fake';
import { makePlaylist } from '@/test/factories';
import { BASIC_M3U, BASIC_XMLTV } from '@/test/fixtures';
import { resetStores, resetTestDatabases } from '@/test/helpers';
import type { Playlist } from '@/types/playlist.types';

const MINUTE = 60_000;
const GUIDE_URL = 'https://epg.example.com/guide.xml';
const PROGRAMME_COUNT = 5;

/**
 * Create a playlist whose channels (with the guide tvg-url) are already
 * imported into the Rust fake, with the XMLTV guide registered for download.
 * Defaults to a 60-minute EPG sync interval that is already overdue.
 */
async function seedPlaylistWithChannels(overrides: Partial<Playlist> = {}): Promise<Playlist> {
  const playlist = makePlaylist({
    epgSyncInterval: 60,
    lastEpgFetchedAt: new Date(Date.now() - 61 * MINUTE),
    ...overrides,
  });
  await playlistRepository.create(playlist);
  usePlaylistStore.setState({ playlists: [playlist] });
  __registerRemoteM3u(playlist.url, BASIC_M3U);
  await RustChannelService.fetchAndImportPlaylist(playlist.id, playlist.name, playlist.url);
  __registerRemoteXmltv(GUIDE_URL, BASIC_XMLTV);
  return playlist;
}

beforeEach(async () => {
  await resetTestDatabases();
  resetStores(usePlaylistStore);
  jest.useFakeTimers();
});

afterEach(() => {
  epgSyncScheduler.stop();
  jest.useRealTimers();
});

it('fetches EPG data for an overdue playlist on the next tick', async () => {
  const playlist = await seedPlaylistWithChannels();

  epgSyncScheduler.start();
  await jest.advanceTimersByTimeAsync(MINUTE);

  const sources = await EpgService.getEpgSourcesByPlaylist(playlist.id);
  expect(sources).toHaveLength(1);
  expect(sources[0].url).toBe(GUIDE_URL);
  expect(sources[0].programmeCount).toBe(PROGRAMME_COUNT);

  const schedule = await EpgService.getChannelSchedule('tv2sport1.no', 0, 2 ** 33);
  expect(schedule.map((p) => p.title)).toEqual([
    'Eliteserien: Rosenborg vs Brann',
    'Premier League Highlights',
  ]);

  const stored = await playlistRepository.getById(playlist.id);
  expect(stored?.lastEpgFetchedAt?.getTime()).toBeGreaterThan(
    playlist.lastEpgFetchedAt!.getTime(),
  );
  expect(usePlaylistStore.getState().playlists[0].lastEpgFetchedAt).toEqual(
    stored?.lastEpgFetchedAt,
  );
});

it('does not sync before the 60-second check interval elapses', async () => {
  const playlist = await seedPlaylistWithChannels();

  epgSyncScheduler.start();
  await jest.advanceTimersByTimeAsync(MINUTE - 1);

  expect(await EpgService.getEpgSourcesByPlaylist(playlist.id)).toEqual([]);

  await jest.advanceTimersByTimeAsync(1);
  const sources = await EpgService.getEpgSourcesByPlaylist(playlist.id);
  expect(sources).toHaveLength(1);
});

it('leaves playlists alone that are not yet due', async () => {
  const playlist = await seedPlaylistWithChannels({ lastEpgFetchedAt: new Date() });

  epgSyncScheduler.start();
  await jest.advanceTimersByTimeAsync(MINUTE);

  expect(await EpgService.getEpgSourcesByPlaylist(playlist.id)).toEqual([]);
  expect(usePlaylistStore.getState().playlists[0].lastEpgFetchedAt).toEqual(
    playlist.lastEpgFetchedAt,
  );
});

it('never syncs playlists without an EPG sync interval', async () => {
  const playlist = await seedPlaylistWithChannels({
    epgSyncInterval: undefined,
    lastEpgFetchedAt: undefined,
  });

  epgSyncScheduler.start();
  await jest.advanceTimersByTimeAsync(3 * MINUTE);

  expect(await EpgService.getEpgSourcesByPlaylist(playlist.id)).toEqual([]);
});

it('treats a playlist with no previous EPG fetch as overdue', async () => {
  const playlist = await seedPlaylistWithChannels({ lastEpgFetchedAt: undefined });

  epgSyncScheduler.start();
  await jest.advanceTimersByTimeAsync(MINUTE);

  const sources = await EpgService.getEpgSourcesByPlaylist(playlist.id);
  expect(sources).toHaveLength(1);
  expect(sources[0].programmeCount).toBe(PROGRAMME_COUNT);
});

it('does not re-sync until the per-playlist interval elapses again', async () => {
  const playlist = await seedPlaylistWithChannels();

  epgSyncScheduler.start();
  await jest.advanceTimersByTimeAsync(MINUTE);
  const afterFirstSync = (await playlistRepository.getById(playlist.id))?.lastEpgFetchedAt;
  expect(afterFirstSync).toBeDefined();

  // 5 more checks pass, but the 60-minute EPG interval has not elapsed.
  await jest.advanceTimersByTimeAsync(5 * MINUTE);
  const later = (await playlistRepository.getById(playlist.id))?.lastEpgFetchedAt;
  expect(later).toEqual(afterFirstSync);
});

it('records the fetch time even when no EPG sources are found', async () => {
  // Channels without tvg-url and a non-Xtream playlist URL: detection finds
  // nothing, but the scheduler still stamps lastEpgFetchedAt (actual behavior).
  const playlist = makePlaylist({
    epgSyncInterval: 60,
    lastEpgFetchedAt: undefined,
  });
  await playlistRepository.create(playlist);
  usePlaylistStore.setState({ playlists: [playlist] });
  __registerRemoteM3u(
    playlist.url,
    '#EXTM3U\n#EXTINF:-1 tvg-id="local.test" group-title="Local",Local Channel\nhttp://stream.example.com/live/local.m3u8\n',
  );
  await RustChannelService.fetchAndImportPlaylist(playlist.id, playlist.name, playlist.url);

  epgSyncScheduler.start();
  await jest.advanceTimersByTimeAsync(MINUTE);

  expect(await EpgService.getEpgSourcesByPlaylist(playlist.id)).toEqual([]);
  const stored = await playlistRepository.getById(playlist.id);
  expect(stored?.lastEpgFetchedAt).toBeDefined();
});

it('stops checking after stop()', async () => {
  const playlist = await seedPlaylistWithChannels();

  epgSyncScheduler.start();
  epgSyncScheduler.stop();
  await jest.advanceTimersByTimeAsync(5 * MINUTE);

  expect(await EpgService.getEpgSourcesByPlaylist(playlist.id)).toEqual([]);
});
