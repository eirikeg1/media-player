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

  it('throws for a missing id', async () => {
    silenceConsoleError();
    await expect(playlistRepository.update('missing-id', { name: 'X' })).rejects.toThrow(
      'Playlist with id missing-id not found',
    );
  });
});

describe('delete', () => {
  it('removes the playlist', async () => {
    await playlistRepository.create(makePlaylist({ id: 'pl-1' }));

    await playlistRepository.delete('pl-1');

    await expect(playlistRepository.getById('pl-1')).resolves.toBeNull();
  });

  it('throws for a missing id', async () => {
    silenceConsoleError();
    await expect(playlistRepository.delete('missing-id')).rejects.toThrow(
      'Playlist with id missing-id not found',
    );
  });
});

describe('clear', () => {
  it('removes all playlists and legacy channel rows', async () => {
    await playlistRepository.create(makePlaylist({ id: 'pl-1' }));
    await playlistRepository.create(makePlaylist({ id: 'pl-2' }));
    await executeStatement(
      'INSERT INTO channels (id, playlistId, name, url) VALUES (?, ?, ?, ?)',
      ['ch-1', 'pl-1', 'Channel 1', 'http://stream.example.com/1.m3u8'],
    );

    await playlistRepository.clear();

    await expect(playlistRepository.getAll()).resolves.toEqual([]);
    const channelRow = await executeQuerySingle('SELECT * FROM channels');
    expect(channelRow).toBeNull();
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
