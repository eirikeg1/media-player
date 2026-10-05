/**
 * Integration tests for the playlist store: real zustand store driving the
 * real playlist repository (SQLite fake) and the Rust-backend fake for
 * channel import. Remote playlist/EPG content is served from registered
 * fixtures; only the native file-system boundary is mocked.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { playlistRepository } from '@/db/playlist-repository';
import { userRepository } from '@/db/user-repository';
import { EpgService } from '@/services/epg-service';
import { RustChannelService, getRustDatabase } from '@/services/rust-channel-service';
import { useFirstPageCacheStore } from '@/stores/cache/first-page-cache-store';
import { useImportProgressStore } from '@/stores/playlist/import-progress-store';
import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import { useUserStore } from '@/stores/user/user-store';
import {
  DEFAULT_EPG_SYNC_MINUTES,
  DEFAULT_PLAYLIST_SYNC_MINUTES,
  SYNC_OFF,
} from '@/lib/sync-intervals';
import { makePlaylist } from '@/test/factories';
import {
  M3uParserError,
  __registerRemoteM3u,
  __registerRemoteXmltv,
} from '@/test/fakes/m3u-database-fake';
import { BASIC_M3U, BASIC_M3U_COUNTS, BASIC_XMLTV } from '@/test/fixtures';
import { flushAsync, resetStores, resetTestDatabases } from '@/test/helpers';

const PLAYLIST_URL = 'https://iptv.example.com/basic.m3u';
const SECOND_PLAYLIST_URL = 'https://iptv.example.com/second.m3u';
const MISSING_URL = 'https://iptv.example.com/unregistered.m3u';
const EPG_URL = 'https://epg.example.com/guide.xml';

/** Register the fixture playlist plus the EPG guide its channels reference. */
function registerRemoteFixtures(): void {
  __registerRemoteM3u(PLAYLIST_URL, BASIC_M3U);
  __registerRemoteM3u(SECOND_PLAYLIST_URL, BASIC_M3U);
  __registerRemoteXmltv(EPG_URL, BASIC_XMLTV);
}

beforeEach(async () => {
  await resetTestDatabases();
  resetStores(usePlaylistStore, useUserStore, useImportProgressStore, useFirstPageCacheStore);
  registerRemoteFixtures();
});

afterEach(async () => {
  // Let any fire-and-forget EPG imports settle before the next reset.
  await flushAsync();
  jest.restoreAllMocks();
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
      usePlaylistStore.getState().addPlaylist({ name: 'Broken', url: MISSING_URL }),
    ).rejects.toThrow();

    const state = usePlaylistStore.getState();
    expect(state.playlists).toEqual([]);
    expect(state.error).not.toBeNull();
    expect(state.isLoading).toBe(false);
    expect(await playlistRepository.getAll()).toEqual([]);
  });

  it('clears the import progress entry when the import fails', async () => {
    await useUserStore.getState().createUser({ username: 'Owner' });

    await expect(
      usePlaylistStore.getState().addPlaylist({ name: 'Broken', url: MISSING_URL }),
    ).rejects.toThrow();

    // A stuck entry would make every card look busy and the scheduler skip it.
    expect(useImportProgressStore.getState().imports).toEqual({});
  });

  it('leaves the list loading flag alone — an import is not a list load', async () => {
    await useUserStore.getState().createUser({ username: 'Owner' });
    const seen: boolean[] = [];
    const unsubscribe = usePlaylistStore.subscribe((state) => seen.push(state.isLoading));

    await usePlaylistStore.getState().addPlaylist({ name: 'My IPTV', url: PLAYLIST_URL });
    unsubscribe();

    expect(seen).not.toContain(true);
  });

  it('records the EPG fetch time only once a guide has downloaded', async () => {
    await useUserStore.getState().createUser({ username: 'Owner' });

    await usePlaylistStore.getState().addPlaylist({ name: 'My IPTV', url: PLAYLIST_URL });
    const created = usePlaylistStore.getState().playlists[0];
    // Nothing is claimed up front: the guide download is still in flight here.
    expect(created.lastEpgFetchedAt).toBeUndefined();

    await flushAsync();

    expect(
      (await playlistRepository.getById(created.id))?.lastEpgFetchedAt,
    ).toBeDefined();
  });

  it('leaves the EPG fetch time unset when every guide fails to download', async () => {
    await useUserStore.getState().createUser({ username: 'Owner' });
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(EpgService, 'detectAndFetchEpgSources').mockResolvedValue({
      sources: [
        { id: 'src-1', url: EPG_URL, autoDetected: true, programmeCount: 0, playlistId: 'pl-1' },
      ],
      succeeded: 0,
      failed: 1,
    });

    await usePlaylistStore.getState().addPlaylist({ name: 'My IPTV', url: PLAYLIST_URL });
    await flushAsync();

    // Stamping it would make the EPG scheduler wait a full interval before
    // trying again, so the guide would stay missing all day.
    const playlistId = usePlaylistStore.getState().playlists[0].id;
    expect((await playlistRepository.getById(playlistId))?.lastEpgFetchedAt).toBeUndefined();
  });

  it('stores the default sync intervals, so a new playlist syncs on its own', async () => {
    await useUserStore.getState().createUser({ username: 'Owner' });

    await usePlaylistStore.getState().addPlaylist({ name: 'My IPTV', url: PLAYLIST_URL });

    const stored = await playlistRepository.getById(usePlaylistStore.getState().playlists[0].id);
    expect(stored?.syncInterval).toBe(DEFAULT_PLAYLIST_SYNC_MINUTES);
    expect(stored?.epgSyncInterval).toBe(DEFAULT_EPG_SYNC_MINUTES);
  });

  it('stores the intervals the form chose, Off included', async () => {
    await useUserStore.getState().createUser({ username: 'Owner' });

    await usePlaylistStore.getState().addPlaylist({
      name: 'My IPTV',
      url: PLAYLIST_URL,
      syncInterval: SYNC_OFF,
      epgSyncInterval: 720,
    });

    const stored = await playlistRepository.getById(usePlaylistStore.getState().playlists[0].id);
    expect(stored?.syncInterval).toBe(SYNC_OFF);
    expect(stored?.epgSyncInterval).toBe(720);
  });

  it('imports under the id the caller supplied, so it can follow the progress', async () => {
    await useUserStore.getState().createUser({ username: 'Owner' });

    await usePlaylistStore
      .getState()
      .addPlaylist({ id: 'chosen-id', name: 'My IPTV', url: PLAYLIST_URL });

    expect(usePlaylistStore.getState().playlists[0].id).toBe('chosen-id');
    expect(await RustChannelService.countChannelsByPlaylist('chosen-id')).toBe(
      BASIC_M3U_COUNTS.total,
    );
  });

  it('invalidates the cached first page so the new channels are visible', async () => {
    await useUserStore.getState().createUser({ username: 'Owner' });
    const invalidate = jest.spyOn(useFirstPageCacheStore.getState(), 'invalidatePlaylist');

    await usePlaylistStore.getState().addPlaylist({ name: 'My IPTV', url: PLAYLIST_URL });

    const playlistId = usePlaylistStore.getState().playlists[0].id;
    expect(invalidate).toHaveBeenCalledWith(playlistId);
  });
});

describe('refreshPlaylist', () => {
  it('re-imports the playlist and records the fetch time', async () => {
    await useUserStore.getState().createUser({ username: 'Owner' });
    await usePlaylistStore.getState().addPlaylist({ name: 'First', url: PLAYLIST_URL });
    const before = usePlaylistStore.getState().playlists[0];

    await usePlaylistStore.getState().refreshPlaylist(before.id);

    const after = usePlaylistStore.getState().playlists[0];
    expect(after.channelCount).toBe(BASIC_M3U_COUNTS.total);
    expect(after.lastFetchedAt!.getTime()).toBeGreaterThanOrEqual(before.lastFetchedAt!.getTime());
    expect((await playlistRepository.getById(before.id))?.lastFetchedAt).toEqual(
      after.lastFetchedAt,
    );
    expect(useImportProgressStore.getState().imports).toEqual({});
  });

  it('classifies a duplicate import by its error code, not its wording', async () => {
    await useUserStore.getState().createUser({ username: 'Owner' });
    await usePlaylistStore.getState().addPlaylist({ name: 'First', url: PLAYLIST_URL });
    const playlist = usePlaylistStore.getState().playlists[0];
    // Wording the message match would miss entirely; the code is what the
    // native module guarantees.
    jest
      .spyOn(RustChannelService, 'fetchAndImportPlaylist')
      .mockRejectedValueOnce(new M3uParserError('Import busy', 'ALREADY_IN_PROGRESS'));

    await expect(usePlaylistStore.getState().refreshPlaylist(playlist.id)).rejects.toThrow(
      'already being imported',
    );

    // A duplicate is not a failure of the running import, so the banner stays
    // clear. The entry this refresh created is still its own to remove: leaving
    // it behind would make every gate that reads it think an import is running
    // for the rest of the session.
    expect(usePlaylistStore.getState().error).toBeNull();
    expect(useImportProgressStore.getState().imports).toEqual({});
  });

  it('leaves the entry of the import it joined alone', async () => {
    await useUserStore.getState().createUser({ username: 'Owner' });
    await usePlaylistStore.getState().addPlaylist({ name: 'First', url: PLAYLIST_URL });
    const playlist = usePlaylistStore.getState().playlists[0];
    // Someone else's import is already tracked; this refresh joins it and is
    // told the native side is busy.
    useImportProgressStore.getState().startImport(playlist.id);
    jest
      .spyOn(RustChannelService, 'fetchAndImportPlaylist')
      .mockRejectedValueOnce(new M3uParserError('Import busy', 'ALREADY_IN_PROGRESS'));

    await expect(usePlaylistStore.getState().refreshPlaylist(playlist.id)).rejects.toThrow(
      'already being imported',
    );

    // The entry describes the run that is still going: clearing it would hide
    // live progress from the card that owns it.
    expect(useImportProgressStore.getState().imports[playlist.id]).toBeDefined();
  });

  it('keeps a silent refresh failure out of the error banner', async () => {
    const playlist = makePlaylist({ url: MISSING_URL });
    await playlistRepository.create(playlist);
    usePlaylistStore.setState({ playlists: [playlist] });

    await expect(
      usePlaylistStore.getState().refreshPlaylist(playlist.id, { silent: true }),
    ).rejects.toThrow();

    expect(usePlaylistStore.getState().error).toBeNull();
    expect(useImportProgressStore.getState().imports).toEqual({});
  });
});

describe('updatePlaylist', () => {
  /** Add the fixture playlist and return the stored row. */
  async function addPlaylist(name = 'First') {
    await useUserStore.getState().createUser({ username: 'Owner' });
    await usePlaylistStore.getState().addPlaylist({ name, url: PLAYLIST_URL });
    return usePlaylistStore.getState().playlists[0];
  }

  it('persists metadata without re-importing when the source is unchanged', async () => {
    const playlist = await addPlaylist();
    const importSpy = jest.spyOn(RustChannelService, 'fetchAndImportPlaylist');

    await usePlaylistStore.getState().updatePlaylist(playlist.id, {
      name: 'Renamed',
      url: playlist.url,
      syncInterval: 120,
    });

    expect(importSpy).not.toHaveBeenCalled();
    const stored = await playlistRepository.getById(playlist.id);
    expect(stored?.name).toBe('Renamed');
    expect(stored?.syncInterval).toBe(120);
    expect(stored?.lastFetchedAt).toEqual(playlist.lastFetchedAt);
  });

  it('re-imports when the URL changes', async () => {
    const playlist = await addPlaylist();

    await usePlaylistStore
      .getState()
      .updatePlaylist(playlist.id, { name: playlist.name, url: SECOND_PLAYLIST_URL });

    const stored = await playlistRepository.getById(playlist.id);
    expect(stored?.url).toBe(SECOND_PLAYLIST_URL);
    expect(stored?.channelCount).toBe(BASIC_M3U_COUNTS.total);
    expect(stored?.lastFetchedAt!.getTime()).toBeGreaterThanOrEqual(
      playlist.lastFetchedAt!.getTime(),
    );
    const metadata = await RustChannelService.getPlaylistMetadata(playlist.id);
    expect(metadata?.url).toBe(SECOND_PLAYLIST_URL);
  });

  it('re-imports when only the credentials change', async () => {
    const playlist = await addPlaylist();
    const importSpy = jest.spyOn(RustChannelService, 'fetchAndImportPlaylist');

    await usePlaylistStore.getState().updatePlaylist(playlist.id, {
      name: playlist.name,
      url: playlist.url,
      credentials: { username: 'new-user', password: 'new-pass' },
    });

    expect(importSpy).toHaveBeenCalledTimes(1);
    const metadata = await RustChannelService.getPlaylistMetadata(playlist.id);
    expect(metadata?.username).toBe('new-user');
  });

  it('keeps the edited metadata but not the new source when the re-import fails', async () => {
    const playlist = await addPlaylist();

    await expect(
      usePlaylistStore
        .getState()
        .updatePlaylist(playlist.id, { name: 'Renamed', url: MISSING_URL }),
    ).rejects.toThrow();

    const stored = await playlistRepository.getById(playlist.id);
    expect(stored?.name).toBe('Renamed');
    // The URL is only stored once an import from it succeeded: keeping it would
    // leave the playlist pointing at a server it has no channels from, and every
    // later sync would fetch from there.
    expect(stored?.url).toBe(PLAYLIST_URL);
    expect(usePlaylistStore.getState().playlists[0].url).toBe(PLAYLIST_URL);
    expect(usePlaylistStore.getState().error).not.toBeNull();
    expect(useImportProgressStore.getState().imports).toEqual({});
  });

  it('keeps the credentials that still work when the re-import fails', async () => {
    const playlist = await addPlaylist();
    jest
      .spyOn(RustChannelService, 'fetchAndImportPlaylist')
      .mockRejectedValueOnce(new Error('auth failed'));

    await expect(
      usePlaylistStore.getState().updatePlaylist(playlist.id, {
        credentials: { username: 'typo', password: 'typo' },
      }),
    ).rejects.toThrow('auth failed');

    expect((await playlistRepository.getById(playlist.id))?.credentials).toBeUndefined();
  });

  it('refuses to change the source while the playlist is importing', async () => {
    const playlist = await addPlaylist();
    useImportProgressStore.getState().startImport(playlist.id);
    const importSpy = jest.spyOn(RustChannelService, 'fetchAndImportPlaylist');

    await expect(
      usePlaylistStore.getState().updatePlaylist(playlist.id, { url: SECOND_PLAYLIST_URL }),
    ).rejects.toThrow(/being imported/);

    expect(importSpy).not.toHaveBeenCalled();
    expect((await playlistRepository.getById(playlist.id))?.url).toBe(PLAYLIST_URL);
  });

  it('rejects an invalid URL before writing anything', async () => {
    const playlist = await addPlaylist();

    await expect(
      usePlaylistStore.getState().updatePlaylist(playlist.id, { url: 'not-a-url' }),
    ).rejects.toThrow('Invalid URL format');

    expect((await playlistRepository.getById(playlist.id))?.url).toBe(PLAYLIST_URL);
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

  it('clears the removed playlist from the user settings', async () => {
    const user = await useUserStore.getState().createUser({ username: 'Owner' });
    await usePlaylistStore.getState().addPlaylist({ name: 'First', url: PLAYLIST_URL });
    const playlistId = usePlaylistStore.getState().playlists[0].id;
    await usePlaylistStore.getState().setActivePlaylist(playlistId);

    await usePlaylistStore.getState().removePlaylist(playlistId);

    expect((await userRepository.getUserSettings(user.id))?.activePlaylistId).toBeUndefined();
  });

  it('refuses to delete a playlist that is being imported', async () => {
    await useUserStore.getState().createUser({ username: 'Owner' });
    await usePlaylistStore.getState().addPlaylist({ name: 'First', url: PLAYLIST_URL });
    const playlistId = usePlaylistStore.getState().playlists[0].id;
    useImportProgressStore.getState().startImport(playlistId);

    await expect(usePlaylistStore.getState().removePlaylist(playlistId)).rejects.toThrow(
      /being imported/,
    );

    expect(usePlaylistStore.getState().playlists).toHaveLength(1);
    expect(await playlistRepository.getById(playlistId)).not.toBeNull();
  });

  it('restores the whole slice when the row cannot be deleted', async () => {
    await useUserStore.getState().createUser({ username: 'Owner' });
    await usePlaylistStore.getState().addPlaylist({ name: 'First', url: PLAYLIST_URL });
    await usePlaylistStore.getState().addPlaylist({ name: 'Second', url: SECOND_PLAYLIST_URL });
    const [first, second] = usePlaylistStore.getState().playlists;
    await usePlaylistStore.getState().setActivePlaylist(second.id);
    jest.spyOn(playlistRepository, 'delete').mockRejectedValue(new Error('database is busy'));

    await expect(usePlaylistStore.getState().removePlaylist(first.id)).rejects.toThrow(
      'database is busy',
    );

    const state = usePlaylistStore.getState();
    expect(state.playlists.map((p) => p.id)).toEqual([first.id, second.id]);
    expect(state.activePlaylistId).toBe(second.id);
    expect(state.error).toBe('database is busy');
  });

  it('keeps the playlist removed when only its channels could not be deleted', async () => {
    await useUserStore.getState().createUser({ username: 'Owner' });
    await usePlaylistStore.getState().addPlaylist({ name: 'First', url: PLAYLIST_URL });
    const playlistId = usePlaylistStore.getState().playlists[0].id;
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(RustChannelService, 'deletePlaylist').mockRejectedValue(new Error('rust is busy'));

    await usePlaylistStore.getState().removePlaylist(playlistId);

    // The row the user asked to delete is gone; orphaned channel rows are not a
    // reason to put the playlist back on screen.
    expect(usePlaylistStore.getState().playlists).toEqual([]);
    expect(await playlistRepository.getById(playlistId)).toBeNull();
    expect(usePlaylistStore.getState().error).toBeNull();
  });

  it('deletes the playlist row before its channels', async () => {
    await useUserStore.getState().createUser({ username: 'Owner' });
    await usePlaylistStore.getState().addPlaylist({ name: 'First', url: PLAYLIST_URL });
    const playlistId = usePlaylistStore.getState().playlists[0].id;
    const order: string[] = [];
    jest.spyOn(RustChannelService, 'deletePlaylist').mockImplementation(async () => {
      order.push('rust');
    });
    jest.spyOn(playlistRepository, 'delete').mockImplementation(async () => {
      order.push('js');
    });

    await usePlaylistStore.getState().removePlaylist(playlistId);

    // The row is what every screen reads, so it is the step allowed to fail:
    // deleting the channels first would leave a playlist on screen whose content
    // is already gone.
    expect(order).toEqual(['js', 'rust']);
  });
});

describe('module graph', () => {
  it('does not import the user store, statically or dynamically', () => {
    const source = readFileSync(
      join(__dirname, '..', 'playlist-store.ts'),
      'utf-8',
    );

    // The dependency runs user store -> playlist store. Reaching back the other
    // way is the cycle `current-user-context` exists to break: it came back once
    // as a lazy `await import()`, which a static-import lint rule cannot catch.
    // Comments are stripped first so a note explaining this rule cannot trip it.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/from\s+['"][^'"]*user-store/);
    expect(code).not.toMatch(/\bimport\s*\(/);
  });
});
