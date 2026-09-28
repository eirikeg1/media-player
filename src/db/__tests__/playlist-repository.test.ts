/**
 * Behavioral tests for the playlist repository against real SQLite. Channel
 * storage is delegated to the Rust backend, so these tests focus on the
 * playlist metadata SQL: CRUD, credential handling, timestamps, the
 * epgUrl/syncInterval columns, and sharing visibility.
 */
import { playlistRepository } from '@/db/playlist-repository';
import { userRepository } from '@/db/user-repository';
import { executeQuerySingle, executeStatement } from '@/db/sqlite-client';
import { FACTORY_NOW as BASE_TIME, makePlaylist, makePlaylistCredentials } from '@/test/factories';
import { resetTestDatabases, tick } from '@/test/helpers';

interface PlaylistRawRow {
  id: string;
  username: string | null;
  password: string | null;
  epgUrl: string | null;
  syncInterval: number | null;
  epgSyncInterval: number | null;
}

async function getRawPlaylistRow(id: string): Promise<PlaylistRawRow | null> {
  return executeQuerySingle<PlaylistRawRow>('SELECT * FROM playlists WHERE id = ?', [id]);
}

beforeEach(async () => {
  jest.useFakeTimers();
  jest.setSystemTime(BASE_TIME);
  await resetTestDatabases();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

/** The repository logs expected not-found errors; keep test output clean. */
function silenceConsoleError(): void {
  jest.spyOn(console, 'error').mockImplementation(() => {});
}

describe('create / getById', () => {
  it('round-trips all metadata columns', async () => {
    const playlist = makePlaylist({
      id: 'pl-1',
      name: 'My IPTV',
      url: 'https://iptv.example.com/list.m3u',
      epgUrl: 'https://iptv.example.com/guide.xml',
      channelCount: 42,
      syncInterval: 24,
      epgSyncInterval: 12,
      createdByUserId: 'user-1',
      createdAt: BASE_TIME,
      updatedAt: BASE_TIME,
      lastFetchedAt: new Date(BASE_TIME.getTime() - 60_000),
      lastEpgFetchedAt: new Date(BASE_TIME.getTime() - 30_000),
    });

    await playlistRepository.create(playlist);
    const fetched = await playlistRepository.getById('pl-1');

    expect(fetched).toMatchObject({
      id: 'pl-1',
      name: 'My IPTV',
      url: 'https://iptv.example.com/list.m3u',
      epgUrl: 'https://iptv.example.com/guide.xml',
      channelCount: 42,
      syncInterval: 24,
      epgSyncInterval: 12,
      createdByUserId: 'user-1',
    });
    expect(fetched?.createdAt).toEqual(BASE_TIME);
    expect(fetched?.updatedAt).toEqual(BASE_TIME);
    expect(fetched?.lastFetchedAt).toEqual(new Date(BASE_TIME.getTime() - 60_000));
    expect(fetched?.lastEpgFetchedAt).toEqual(new Date(BASE_TIME.getTime() - 30_000));
  });

  it('leaves optional columns NULL when omitted', async () => {
    await playlistRepository.create(makePlaylist({ id: 'pl-1' }));

    const row = await getRawPlaylistRow('pl-1');
    expect(row).toMatchObject({
      epgUrl: null,
      username: null,
      password: null,
      syncInterval: null,
      epgSyncInterval: null,
    });

    const fetched = await playlistRepository.getById('pl-1');
    expect(fetched?.epgUrl).toBeUndefined();
    expect(fetched?.syncInterval).toBeUndefined();
    expect(fetched?.credentials).toBeUndefined();
    expect(fetched?.lastFetchedAt).toBeUndefined();
  });

  it('returns null for a missing id', async () => {
    await expect(playlistRepository.getById('missing-id')).resolves.toBeNull();
  });
});

describe('credential handling', () => {
  it('round-trips username and password', async () => {
    await playlistRepository.create(
      makePlaylist({ id: 'pl-1', credentials: makePlaylistCredentials() }),
    );

    const row = await getRawPlaylistRow('pl-1');
    expect(row?.username).toBe('test-user');
    expect(row?.password).toBe('test-pass');

    const fetched = await playlistRepository.getById('pl-1');
    expect(fetched?.credentials).toEqual({ username: 'test-user', password: 'test-pass' });
  });

  it('only exposes credentials when both username and password are present', async () => {
    await playlistRepository.create(
      makePlaylist({ id: 'pl-1', credentials: { username: 'only-user', password: '' } }),
    );

    const row = await getRawPlaylistRow('pl-1');
    expect(row?.username).toBe('only-user');
    expect(row?.password).toBeNull();

    const fetched = await playlistRepository.getById('pl-1');
    expect(fetched?.credentials).toBeUndefined();
  });
});

describe('getAll', () => {
  it('returns an empty array when there are no playlists', async () => {
    await expect(playlistRepository.getAll()).resolves.toEqual([]);
  });

  it('orders playlists by createdAt descending', async () => {
    await playlistRepository.create(makePlaylist({ id: 'pl-old', createdAt: BASE_TIME }));
    await playlistRepository.create(
      makePlaylist({ id: 'pl-new', createdAt: new Date(BASE_TIME.getTime() + 1000) }),
    );

    const playlists = await playlistRepository.getAll();
    expect(playlists.map((p) => p.id)).toEqual(['pl-new', 'pl-old']);
  });
});

describe('update', () => {
  it('applies partial updates, preserves the rest, and bumps updatedAt', async () => {
    await playlistRepository.create(
      makePlaylist({ id: 'pl-1', name: 'Original', channelCount: 10, createdAt: BASE_TIME, updatedAt: BASE_TIME }),
    );
    tick();

    const updated = await playlistRepository.update('pl-1', { name: 'Renamed' });
    expect(updated.name).toBe('Renamed');
    expect(updated.updatedAt.getTime()).toBe(BASE_TIME.getTime() + 1000);

    const fetched = await playlistRepository.getById('pl-1');
    expect(fetched?.name).toBe('Renamed');
    expect(fetched?.channelCount).toBe(10);
    expect(fetched?.createdAt).toEqual(BASE_TIME);
    expect(fetched?.updatedAt).toEqual(new Date(BASE_TIME.getTime() + 1000));
  });

  it('updates epgUrl, sync intervals, and credentials', async () => {
    await playlistRepository.create(makePlaylist({ id: 'pl-1' }));

    await playlistRepository.update('pl-1', {
      epgUrl: 'https://epg.example.com/guide.xml',
      syncInterval: 6,
      epgSyncInterval: 3,
      credentials: { username: 'new-user', password: 'new-pass' },
    });

    const fetched = await playlistRepository.getById('pl-1');
    expect(fetched?.epgUrl).toBe('https://epg.example.com/guide.xml');
    expect(fetched?.syncInterval).toBe(6);
    expect(fetched?.epgSyncInterval).toBe(3);
    expect(fetched?.credentials).toEqual({ username: 'new-user', password: 'new-pass' });
  });

  it('writes only the patched columns, so two writers do not clobber each other', async () => {
    await playlistRepository.create(makePlaylist({ id: 'pl-1', channelCount: 10 }));
    const epgFetchedAt = new Date(BASE_TIME.getTime() + 5_000);

    // Genuinely concurrent: a background sync recording channelCount while the
    // EPG job records lastEpgFetchedAt. Each reads the row before writing, so a
    // full-row write would resurrect what it read and undo the other's change.
    const [afterSync, afterEpg] = await Promise.all([
      playlistRepository.update('pl-1', { channelCount: 4200 }),
      playlistRepository.update('pl-1', { lastEpgFetchedAt: epgFetchedAt }),
    ]);

    // Each caller gets the row as it stands after its own write, not the
    // snapshot it read before it.
    expect(afterSync.channelCount).toBe(4200);
    expect(afterEpg.lastEpgFetchedAt).toEqual(epgFetchedAt);

    const fetched = await playlistRepository.getById('pl-1');
    expect(fetched?.channelCount).toBe(4200);
    expect(fetched?.lastEpgFetchedAt).toEqual(epgFetchedAt);
  });

  it('clears a nullable column when the patch carries undefined for it', async () => {
    await playlistRepository.create(
      makePlaylist({ id: 'pl-1', syncInterval: 12, epgUrl: 'https://epg.example.com/guide.xml' }),
    );

    await playlistRepository.update('pl-1', { syncInterval: undefined });

    const fetched = await playlistRepository.getById('pl-1');
    expect(fetched?.syncInterval).toBeUndefined();
    // Columns the patch never mentioned are untouched.
    expect(fetched?.epgUrl).toBe('https://epg.example.com/guide.xml');
  });

  it('throws for a missing id', async () => {
    silenceConsoleError();
    await expect(playlistRepository.update('missing-id', { name: 'X' })).rejects.toThrow(
      'Playlist with id missing-id not found',
    );
  });
});

describe('invalid stored timestamps', () => {
  it('reads an unparseable timestamp as the epoch instead of an Invalid Date', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await playlistRepository.create(makePlaylist({ id: 'pl-1' }));
    await executeStatement('UPDATE playlists SET lastFetchedAt = ?, updatedAt = ? WHERE id = ?', [
      'not-a-date',
      'also-not-a-date',
      'pl-1',
    ]);

    const fetched = await playlistRepository.getById('pl-1');

    // NaN made every "is it time to sync?" comparison false, so the playlist
    // never synced again; the epoch reads as "infinitely stale" instead.
    expect(fetched?.lastFetchedAt).toEqual(new Date(0));
    expect(fetched?.updatedAt).toEqual(new Date(0));
    expect(warn).toHaveBeenCalled();
  });
});

describe('delete', () => {
  it('removes the playlist', async () => {
    await playlistRepository.create(makePlaylist({ id: 'pl-1' }));

    await playlistRepository.delete('pl-1');

    await expect(playlistRepository.getById('pl-1')).resolves.toBeNull();
  });

  it('accepts a delete of a playlist that is already gone', async () => {
    // Idempotent by design: the store deletes the row and the channels behind
    // it, and a retry (or a second tap) must not report a failure for work that
    // has already happened.
    await expect(playlistRepository.delete('missing-id')).resolves.toBeUndefined();
  });
});

describe('getVisiblePlaylists', () => {
  it('returns own playlists, ownerless playlists, and shared playlists from sharing users', async () => {
    const alice = await userRepository.createUser({ username: 'Alice' });
    const bob = await userRepository.createUser({ username: 'Bob' });
    const carol = await userRepository.createUser({ username: 'Carol' });
    await userRepository.updateUserSettings(carol.id, { playlistSharingEnabled: false });

    await playlistRepository.create(makePlaylist({ id: 'pl-own', createdByUserId: alice.id }));
    await playlistRepository.create(makePlaylist({ id: 'pl-legacy' }));
    await playlistRepository.create(makePlaylist({ id: 'pl-bob', createdByUserId: bob.id }));
    await playlistRepository.create(makePlaylist({ id: 'pl-carol', createdByUserId: carol.id }));

    const visible = await playlistRepository.getVisiblePlaylists(alice.id, true);
    const ids = visible.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(['pl-own', 'pl-legacy', 'pl-bob']));
    expect(ids).not.toContain('pl-carol');
  });

  it('excludes shared playlists when the viewer has sharing disabled', async () => {
    const alice = await userRepository.createUser({ username: 'Alice' });
    const bob = await userRepository.createUser({ username: 'Bob' });

    await playlistRepository.create(makePlaylist({ id: 'pl-own', createdByUserId: alice.id }));
    await playlistRepository.create(makePlaylist({ id: 'pl-bob', createdByUserId: bob.id }));

    const visible = await playlistRepository.getVisiblePlaylists(alice.id, false);
    expect(visible.map((p) => p.id)).toEqual(['pl-own']);
  });
});
