/**
 * Integration tests for the playlist store: real zustand store driving the
 * real playlist repository (SQLite fake) and the Rust-backend fake for
 * channel import. Remote playlist/EPG content is served from registered
 * fixtures; only the native file-system boundary is mocked.
 */
import { playlistRepository } from '@/db/playlist-repository';
import { getDatabase } from '@/db/sqlite-client';
import { userRepository } from '@/db/user-repository';
import { getRustDatabase } from '@/services/rust-channel-service';
import { useImportProgressStore } from '@/stores/playlist/import-progress-store';
import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import { useUserStore } from '@/stores/user/user-store';
import { makePlaylist } from '@/test/factories';
import { __registerRemoteM3u, __registerRemoteXmltv } from '@/test/fakes/m3u-database-fake';
import { BASIC_M3U, BASIC_M3U_COUNTS, BASIC_XMLTV } from '@/test/fixtures';
import { flushAsync, resetStores, resetTestDatabases } from '@/test/helpers';

const PLAYLIST_URL = 'https://iptv.example.com/basic.m3u';
const SECOND_PLAYLIST_URL = 'https://iptv.example.com/second.m3u';
const EPG_URL = 'https://epg.example.com/guide.xml';

/** Register the fixture playlist plus the EPG guide its channels reference. */
function registerRemoteFixtures(): void {
  __registerRemoteM3u(PLAYLIST_URL, BASIC_M3U);
  __registerRemoteM3u(SECOND_PLAYLIST_URL, BASIC_M3U);
  __registerRemoteXmltv(EPG_URL, BASIC_XMLTV);
}

beforeEach(async () => {
  await resetTestDatabases();
  // Match production: the app never enables PRAGMA foreign_keys (expo-sqlite
  // defaults to OFF), while better-sqlite3 behind the fake enables it.
  await (await getDatabase()).execAsync('PRAGMA foreign_keys = OFF');
  resetStores(usePlaylistStore, useUserStore, useImportProgressStore);
  registerRemoteFixtures();
});

afterEach(async () => {
  // Let any fire-and-forget EPG imports settle before the next reset.
  await flushAsync();
});

describe('loadPlaylists', () => {
  it('initializes to an empty state when nothing is stored', async () => {
    await usePlaylistStore.getState().loadPlaylists();

    const state = usePlaylistStore.getState();
    expect(state.isInitialized).toBe(true);
    expect(state.isLoading).toBe(false);
    expect(state.playlists).toEqual([]);
    expect(state.activePlaylistId).toBeNull();
  });

  it('loads persisted playlists and auto-selects the first when none is active', async () => {
    const playlist = makePlaylist({ id: 'pl-1', name: 'Stored Playlist' });
    await playlistRepository.create(playlist);

    await usePlaylistStore.getState().loadPlaylists();

    const state = usePlaylistStore.getState();
    expect(state.playlists.map((p) => p.id)).toEqual(['pl-1']);
    expect(state.activePlaylistId).toBe('pl-1');
    expect(state.isInitialized).toBe(true);
  });
});

describe('addPlaylist', () => {
  it('imports the remote M3U fixture and persists the playlist end to end', async () => {
    const user = await useUserStore.getState().createUser({ username: 'Owner' });

    await usePlaylistStore.getState().addPlaylist({
      name: '  My IPTV  ',
      url: PLAYLIST_URL,
    });
    await flushAsync();

    const state = usePlaylistStore.getState();
    expect(state.playlists).toHaveLength(1);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();

    const playlist = state.playlists[0];
    expect(playlist.name).toBe('My IPTV');
    expect(playlist.channelCount).toBe(BASIC_M3U_COUNTS.total);
    expect(playlist.createdByUserId).toBe(user.id);
    expect(state.activePlaylistId).toBe(playlist.id);

    // Persisted in the JS repository.
    const persisted = await playlistRepository.getById(playlist.id);
    expect(persisted?.url).toBe(PLAYLIST_URL);
    expect(persisted?.channelCount).toBe(BASIC_M3U_COUNTS.total);

    // Channels imported into the Rust database.
    const rustDb = await getRustDatabase();
    expect(await rustDb.countChannelsByPlaylist(playlist.id)).toBe(BASIC_M3U_COUNTS.total);

    // EPG source auto-detected from tvg-url and imported (fire-and-forget).
    const epgSources = await rustDb.getEpgSourcesByPlaylist(playlist.id);
    expect(epgSources).toHaveLength(1);
    expect(epgSources[0]).toMatchObject({ url: EPG_URL, programmeCount: 5 });
  });

  it('rejects an empty name without touching state', async () => {
    await expect(
      usePlaylistStore.getState().addPlaylist({ name: '   ', url: PLAYLIST_URL }),
    ).rejects.toThrow('Playlist name is required');

    expect(usePlaylistStore.getState().error).toBe('Playlist name is required');
    expect(usePlaylistStore.getState().playlists).toEqual([]);
  });

  it('rejects an invalid URL', async () => {
    await expect(
      usePlaylistStore.getState().addPlaylist({ name: 'Bad', url: 'not-a-url' }),
    ).rejects.toThrow('Invalid URL format');

    expect(usePlaylistStore.getState().error).toBe('Invalid URL format');
  });

  it('rejects a duplicate URL for the same user', async () => {
    await useUserStore.getState().createUser({ username: 'Owner' });
    await usePlaylistStore.getState().addPlaylist({ name: 'First', url: PLAYLIST_URL });

    await expect(
      usePlaylistStore.getState().addPlaylist({ name: 'Second', url: PLAYLIST_URL }),
    ).rejects.toThrow('Playlist from this URL already exists: "First"');

    expect(usePlaylistStore.getState().playlists).toHaveLength(1);
  });

  it('surfaces import failures and stores nothing', async () => {
    await useUserStore.getState().createUser({ username: 'Owner' });

    await expect(
      usePlaylistStore.getState().addPlaylist({
        name: 'Broken',
        url: 'https://iptv.example.com/unregistered.m3u',
      }),
    ).rejects.toThrow();

    const state = usePlaylistStore.getState();
    expect(state.playlists).toEqual([]);
    expect(state.error).not.toBeNull();
    expect(state.isLoading).toBe(false);
    expect(await playlistRepository.getAll()).toEqual([]);
  });
});

describe('setActivePlaylist', () => {
  it('persists the selection to the current user and restores it on reload', async () => {
    const user = await useUserStore.getState().createUser({ username: 'Owner' });
    await usePlaylistStore.getState().addPlaylist({ name: 'First', url: PLAYLIST_URL });
    await usePlaylistStore.getState().addPlaylist({ name: 'Second', url: SECOND_PLAYLIST_URL });
    const second = usePlaylistStore
      .getState()
      .playlists.find((p) => p.url === SECOND_PLAYLIST_URL)!;

    await usePlaylistStore.getState().setActivePlaylist(second.id);

    expect(usePlaylistStore.getState().activePlaylistId).toBe(second.id);
    expect(usePlaylistStore.getState().getActivePlaylist()?.name).toBe('Second');
    expect((await userRepository.getUserSettings(user.id))?.activePlaylistId).toBe(second.id);

    // Simulate an app restart: playlist store state gone, settings persist.
    resetStores(usePlaylistStore);
    await useUserStore.getState().loadUsers();
    await usePlaylistStore.getState().loadPlaylists();

    expect(usePlaylistStore.getState().activePlaylistId).toBe(second.id);
  });

  it('sets an error for an unknown playlist id and keeps the current selection', async () => {
    await useUserStore.getState().createUser({ username: 'Owner' });
    await usePlaylistStore.getState().addPlaylist({ name: 'First', url: PLAYLIST_URL });
    const firstId = usePlaylistStore.getState().activePlaylistId;

    await usePlaylistStore.getState().setActivePlaylist('missing-id');

    expect(usePlaylistStore.getState().error).toBe('Playlist not found');
    expect(usePlaylistStore.getState().activePlaylistId).toBe(firstId);
  });

  it('clears the selection when passed null', async () => {
    await useUserStore.getState().createUser({ username: 'Owner' });
    await usePlaylistStore.getState().addPlaylist({ name: 'First', url: PLAYLIST_URL });

    await usePlaylistStore.getState().setActivePlaylist(null);

    expect(usePlaylistStore.getState().activePlaylistId).toBeNull();
  });
});

describe('removePlaylist', () => {
  it('removes the playlist from state, repository, and Rust database', async () => {
    await useUserStore.getState().createUser({ username: 'Owner' });
    await usePlaylistStore.getState().addPlaylist({ name: 'First', url: PLAYLIST_URL });
    const playlistId = usePlaylistStore.getState().playlists[0].id;

    await usePlaylistStore.getState().removePlaylist(playlistId);

    const state = usePlaylistStore.getState();
    expect(state.playlists).toEqual([]);
    expect(state.activePlaylistId).toBeNull();
    expect(await playlistRepository.getById(playlistId)).toBeNull();

    const rustDb = await getRustDatabase();
    expect(await rustDb.getPlaylist(playlistId)).toBeNull();
    expect(await rustDb.countChannelsByPlaylist(playlistId)).toBe(0);
  });

  it('moves the active selection to a remaining playlist', async () => {
    await useUserStore.getState().createUser({ username: 'Owner' });
    await usePlaylistStore.getState().addPlaylist({ name: 'First', url: PLAYLIST_URL });
    await usePlaylistStore.getState().addPlaylist({ name: 'Second', url: SECOND_PLAYLIST_URL });
    const [first, second] = usePlaylistStore.getState().playlists;
    await usePlaylistStore.getState().setActivePlaylist(first.id);

    await usePlaylistStore.getState().removePlaylist(first.id);

    const state = usePlaylistStore.getState();
    expect(state.playlists.map((p) => p.id)).toEqual([second.id]);
    expect(state.activePlaylistId).toBe(second.id);
  });

  it('sets an error and rethrows when the playlist does not exist', async () => {
    await expect(usePlaylistStore.getState().removePlaylist('missing-id')).rejects.toThrow(
      'Playlist with id missing-id not found',
    );
    expect(usePlaylistStore.getState().error).toBe('Playlist with id missing-id not found');
  });
});
