/**
 * Integration tests for the playlist half of the periodic sync scheduler, plus
 * the mechanics every scheduler shares (the global "a sync is running" gate and
 * foreground ticking).
 *
 * The scheduler polls the playlist store every 60 seconds and triggers the
 * store's real `refreshPlaylist`, which re-imports the playlist through the
 * Rust-backend fake and persists metadata in the (real-SQLite) repository.
 * Timers are faked; the observable outcomes are imported channels and
 * updated `lastFetchedAt` / `channelCount` values.
 */
import { AppState } from 'react-native';
import { epgSyncScheduler, playlistSyncScheduler } from '../periodic-sync-scheduler';
import { EpgService } from '../epg-service';
import { RustChannelService } from '../rust-channel-service';
import { playlistRepository } from '@/db/playlist-repository';
import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import { useImportProgressStore } from '@/stores/playlist/import-progress-store';
import { __registerRemoteM3u, __registerRemoteXmltv } from '@/test/fakes/m3u-database-fake';
import { makePlaylist } from '@/test/factories';
import { BASIC_M3U, BASIC_M3U_COUNTS, BASIC_XMLTV } from '@/test/fixtures';
import { resetStores, resetTestDatabases } from '@/test/helpers';
import type { Playlist } from '@/types/playlist.types';

const MINUTE = 60_000;
const GUIDE_URL = 'https://epg.example.com/guide.xml';

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

it('backs off a playlist whose sync failed instead of retrying every check', async () => {
  // No fixture registered for this URL, so the first sync fails.
  const playlist = await seedPlaylist({ lastFetchedAt: undefined });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(RustChannelService, 'fetchAndImportPlaylist').mockRejectedValueOnce(
    new Error('provider is down'),
  );

  playlistSyncScheduler.start();
  await jest.advanceTimersByTimeAsync(MINUTE);
  expect(await RustChannelService.countChannelsByPlaylist(playlist.id)).toBe(0);

  // Due-ness comes from the last *successful* sync, so without a backoff this
  // playlist would be retried on every 60-second check.
  await jest.advanceTimersByTimeAsync(5 * MINUTE);
  expect(RustChannelService.fetchAndImportPlaylist).toHaveBeenCalledTimes(1);

  await jest.advanceTimersByTimeAsync(30 * MINUTE);
  expect(await RustChannelService.countChannelsByPlaylist(playlist.id)).toBe(
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

describe('foreground ticks', () => {
  /** The listener the scheduler registered with AppState. */
  function emitAppState(state: 'active' | 'inactive' | 'background'): void {
    const spy = AppState.addEventListener as unknown as jest.Mock;
    for (const [, listener] of spy.mock.calls) {
      (listener as (s: string) => void)(state);
    }
  }

  beforeEach(() => {
    jest.spyOn(AppState, 'addEventListener');
  });

  it('checks immediately when the app comes to the foreground', async () => {
    const playlist = await seedPlaylist();

    playlistSyncScheduler.start();
    emitAppState('active');
    await jest.advanceTimersByTimeAsync(0);

    expect(await RustChannelService.countChannelsByPlaylist(playlist.id)).toBe(
      BASIC_M3U_COUNTS.total,
    );
  });

  it('ignores further foregrounds until the minimum spacing has elapsed', async () => {
    const playlist = await seedPlaylist();

    playlistSyncScheduler.start();
    emitAppState('active');
    await jest.advanceTimersByTimeAsync(0);
    const afterFirst = (await playlistRepository.getById(playlist.id))?.lastFetchedAt;
    expect(afterFirst).toBeDefined();

    // Overdue again, and the user bounces back into the app: too soon to sync.
    usePlaylistStore.setState({
      playlists: [{ ...playlist, lastFetchedAt: new Date(Date.now() - 31 * MINUTE) }],
    });
    emitAppState('background');
    emitAppState('active');
    await jest.advanceTimersByTimeAsync(0);

    expect((await playlistRepository.getById(playlist.id))?.lastFetchedAt).toEqual(afterFirst);
  });

  it('does not check while the app is backgrounded', async () => {
    const playlist = await seedPlaylist();

    playlistSyncScheduler.start();
    emitAppState('background');
    await jest.advanceTimersByTimeAsync(5 * MINUTE);

    expect(await RustChannelService.countChannelsByPlaylist(playlist.id)).toBe(0);
  });

  it('keeps checking through a momentary inactive state', async () => {
    const playlist = await seedPlaylist();

    playlistSyncScheduler.start();
    // iOS reports 'inactive' for the app switcher, an incoming call or the
    // notification shade: pausing on those would restart the interval from zero
    // every time and the periodic check would never come around.
    emitAppState('inactive');
    await jest.advanceTimersByTimeAsync(MINUTE);

    expect(await RustChannelService.countChannelsByPlaylist(playlist.id)).toBe(
      BASIC_M3U_COUNTS.total,
    );
  });
});

describe('the shared "a sync is running" gate', () => {
  it('keeps one scheduler off the network while another is syncing', async () => {
    // Overdue for both a playlist re-import and an EPG download.
    const playlist = await seedPlaylist({
      epgSyncInterval: 60,
      lastEpgFetchedAt: new Date(Date.now() - 61 * MINUTE),
    });
    __registerRemoteXmltv(GUIDE_URL, BASIC_XMLTV);

    // An EPG download that does not finish until released. It reports no
    // progress entry of its own, so the playlist scheduler standing down can
    // only be the cross-scheduler gate.
    let releaseEpg = () => {};
    jest.spyOn(EpgService, 'detectAndFetchEpgSources').mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseEpg = () => resolve({ sources: [], succeeded: 0, failed: 0 });
        }),
    );

    // Started first, so its check runs first on the shared 60-second cadence.
    epgSyncScheduler.start();
    playlistSyncScheduler.start();
    try {
      await jest.advanceTimersByTimeAsync(MINUTE);

      // The provider's account allows a single connection: the playlist import
      // waits rather than competing with the download in flight.
      expect(await RustChannelService.countChannelsByPlaylist(playlist.id)).toBe(0);

      releaseEpg();
      await jest.advanceTimersByTimeAsync(MINUTE);

      expect(await RustChannelService.countChannelsByPlaylist(playlist.id)).toBe(
        BASIC_M3U_COUNTS.total,
      );
    } finally {
      epgSyncScheduler.stop();
    }
  });
});
