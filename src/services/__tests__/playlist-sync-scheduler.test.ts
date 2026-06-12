/**
 * Integration tests for the playlist sync scheduler.
 *
 * The scheduler polls the playlist store every 60 seconds and triggers the
 * store's real `refreshPlaylist`, which re-imports the playlist through the
 * Rust-backend fake and persists metadata in the (real-SQLite) repository.
 * Timers are faked; the observable outcomes are imported channels and
 * updated `lastFetchedAt` / `channelCount` values.
 */
import { playlistSyncScheduler } from '../playlist-sync-scheduler';
import { RustChannelService } from '../rust-channel-service';
import { playlistRepository } from '@/db/playlist-repository';
import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import { useImportProgressStore } from '@/stores/playlist/import-progress-store';
import { __registerRemoteM3u } from '@/test/fakes/m3u-database-fake';
import { makePlaylist } from '@/test/factories';
import { BASIC_M3U, BASIC_M3U_COUNTS } from '@/test/fixtures';
import { resetStores, resetTestDatabases } from '@/test/helpers';
import type { Playlist } from '@/types/playlist.types';

const MINUTE = 60_000;

/**
 * Create a playlist in the repository and store with registered remote M3U
 * content. Defaults to a 30-minute sync interval that is already overdue.
 */
async function seedPlaylist(overrides: Partial<Playlist> = {}): Promise<Playlist> {
  const playlist = makePlaylist({
    syncInterval: 30,
    lastFetchedAt: new Date(Date.now() - 31 * MINUTE),
    ...overrides,
  });
  await playlistRepository.create(playlist);
  usePlaylistStore.setState({ playlists: [playlist] });
  __registerRemoteM3u(playlist.url, BASIC_M3U);
  return playlist;
}

beforeEach(async () => {
  await resetTestDatabases();
  resetStores(usePlaylistStore, useImportProgressStore);
  jest.useFakeTimers();
});

afterEach(() => {
  playlistSyncScheduler.stop();
  jest.useRealTimers();
});

it('syncs an overdue playlist on the next tick', async () => {
  const playlist = await seedPlaylist();

  playlistSyncScheduler.start();
  await jest.advanceTimersByTimeAsync(MINUTE);

  expect(await RustChannelService.countChannelsByPlaylist(playlist.id)).toBe(
    BASIC_M3U_COUNTS.total,
  );

  const stored = await playlistRepository.getById(playlist.id);
  expect(stored?.channelCount).toBe(BASIC_M3U_COUNTS.total);
  expect(stored?.lastFetchedAt?.getTime()).toBeGreaterThan(playlist.lastFetchedAt!.getTime());

  const inStore = usePlaylistStore.getState().playlists[0];
  expect(inStore.channelCount).toBe(BASIC_M3U_COUNTS.total);
});

it('does not sync before the 60-second check interval elapses', async () => {
  const playlist = await seedPlaylist();

  playlistSyncScheduler.start();
  await jest.advanceTimersByTimeAsync(MINUTE - 1);

  expect(await RustChannelService.countChannelsByPlaylist(playlist.id)).toBe(0);

  await jest.advanceTimersByTimeAsync(1);
  expect(await RustChannelService.countChannelsByPlaylist(playlist.id)).toBe(
    BASIC_M3U_COUNTS.total,
  );
});

it('leaves playlists alone that are not yet due', async () => {
  const playlist = await seedPlaylist({ lastFetchedAt: new Date() });

  playlistSyncScheduler.start();
  await jest.advanceTimersByTimeAsync(MINUTE);

  expect(await RustChannelService.countChannelsByPlaylist(playlist.id)).toBe(0);
  expect(usePlaylistStore.getState().playlists[0].lastFetchedAt).toEqual(playlist.lastFetchedAt);
});

it('never syncs playlists without a sync interval', async () => {
  const playlist = await seedPlaylist({ syncInterval: undefined, lastFetchedAt: undefined });

  playlistSyncScheduler.start();
  await jest.advanceTimersByTimeAsync(3 * MINUTE);

  expect(await RustChannelService.countChannelsByPlaylist(playlist.id)).toBe(0);
});

it('treats a never-fetched playlist as overdue', async () => {
  const playlist = await seedPlaylist({ lastFetchedAt: undefined });

  playlistSyncScheduler.start();
  await jest.advanceTimersByTimeAsync(MINUTE);

  expect(await RustChannelService.countChannelsByPlaylist(playlist.id)).toBe(
    BASIC_M3U_COUNTS.total,
  );
});

it('does not re-sync until the per-playlist interval elapses again', async () => {
  const playlist = await seedPlaylist();

  playlistSyncScheduler.start();
  await jest.advanceTimersByTimeAsync(MINUTE);
  const afterFirstSync = (await playlistRepository.getById(playlist.id))?.lastFetchedAt;
  expect(afterFirstSync).toBeDefined();

  // 5 more checks pass, but the 30-minute playlist interval has not elapsed.
  await jest.advanceTimersByTimeAsync(5 * MINUTE);
  const later = (await playlistRepository.getById(playlist.id))?.lastFetchedAt;
  expect(later).toEqual(afterFirstSync);
});

it('skips a playlist whose import is already in progress', async () => {
  const playlist = await seedPlaylist();
  useImportProgressStore.getState().startImport(playlist.id);

  playlistSyncScheduler.start();
  await jest.advanceTimersByTimeAsync(MINUTE);

  expect(await RustChannelService.countChannelsByPlaylist(playlist.id)).toBe(0);
});

it('continues with the remaining playlists when one fails', async () => {
  // The first playlist's URL has no registered fixture, so its refresh fails.
  const broken = makePlaylist({ syncInterval: 30, lastFetchedAt: undefined });
  await playlistRepository.create(broken);
  const healthy = await seedPlaylist({ lastFetchedAt: undefined });
  usePlaylistStore.setState({ playlists: [broken, healthy] });

  playlistSyncScheduler.start();
  await jest.advanceTimersByTimeAsync(MINUTE);

  expect(await RustChannelService.countChannelsByPlaylist(broken.id)).toBe(0);
  expect(await RustChannelService.countChannelsByPlaylist(healthy.id)).toBe(
    BASIC_M3U_COUNTS.total,
  );
});

it('stops checking after stop()', async () => {
  const playlist = await seedPlaylist();

  playlistSyncScheduler.start();
  playlistSyncScheduler.stop();
  await jest.advanceTimersByTimeAsync(5 * MINUTE);

  expect(await RustChannelService.countChannelsByPlaylist(playlist.id)).toBe(0);
});
