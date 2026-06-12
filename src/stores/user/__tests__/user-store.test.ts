/**
 * Integration tests for the user store: real zustand store driving the real
 * user repository against the in-memory SQLite fake, plus the Rust-backend
 * fake for series-episode resolution. Only the native file-system boundary is
 * mocked.
 */
import { getDatabase } from '@/db/sqlite-client';
import { userRepository } from '@/db/user-repository';
import { getRustDatabase } from '@/services/rust-channel-service';
import { useHeaderBackgroundStore } from '@/stores/header-background/header-background-store';
import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import { useUserStore } from '@/stores/user/user-store';
import { makePlaylistMetadata } from '@/test/factories';
import { Database as M3uDatabaseFake, __registerRemoteM3u } from '@/test/fakes/m3u-database-fake';
import { BASIC_M3U } from '@/test/fixtures';
import { flushAsync, resetStores, resetTestDatabases } from '@/test/helpers';
import type { Channel } from '@/types/playlist.types';

type FakeDb = InstanceType<typeof M3uDatabaseFake>;

const PLAYLIST_ID = 'pl-1';
const PLAYLIST_URL = 'https://iptv.example.com/basic.m3u';

/** Import the BASIC_M3U fixture into the Rust fake under PLAYLIST_ID. */
async function importBasicPlaylist(): Promise<void> {
  const db = (await getRustDatabase()) as unknown as FakeDb;
  await db.createPlaylist(makePlaylistMetadata({ id: PLAYLIST_ID, url: PLAYLIST_URL }));
  __registerRemoteM3u(PLAYLIST_URL, BASIC_M3U);
  await db.fetchAndImportPlaylist(PLAYLIST_ID, PLAYLIST_URL);
}

const BREAKING_BAD_S01E01: Channel = {
  name: 'Breaking Bad S01E01',
  url: 'http://stream.example.com/series/breaking-bad/s01e01.mkv',
  tvg: { name: 'Breaking Bad', logo: 'https://posters.example.com/breaking-bad.jpg' },
  group: { title: 'Series | Drama' },
};

const BREAKING_BAD_S01E01_ID = `${BREAKING_BAD_S01E01.name}|${BREAKING_BAD_S01E01.url}`;

/** End-to-end watch of an episode so channel_watch_stats has a row for it. */
async function watchChannel(
  userId: string,
  channel: Channel,
  options: { endPosition?: number; totalDuration?: number; completed?: boolean } = {},
): Promise<void> {
  const store = useUserStore.getState();
  const sessionId = await store.startViewingSession({
    userId,
    playlistId: PLAYLIST_ID,
    channelId: `${channel.name}|${channel.url}`,
    channelName: channel.name,
    groupTitle: channel.group.title,
    contentType: 'series',
    totalDuration: options.totalDuration,
  });
  await store.endViewingSession(
    sessionId,
    options.endPosition ?? 100,
    options.endPosition ?? 100,
    options.completed ?? true,
  );
}

beforeEach(async () => {
  await resetTestDatabases();
  // The app never enables PRAGMA foreign_keys (expo-sqlite defaults to OFF),
  // but better-sqlite3 behind the test fake turns it ON. Match production:
  // favorites reference Rust-DB channel ids that the legacy `channels` table
  // (still targeted by an old FOREIGN KEY clause) does not contain.
  await (await getDatabase()).execAsync('PRAGMA foreign_keys = OFF');
  resetStores(useUserStore, usePlaylistStore, useHeaderBackgroundStore);
});

describe('loadUsers', () => {
  it('resolves to an empty, non-loading state when no users exist', async () => {
    await useUserStore.getState().loadUsers();

    const state = useUserStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.users).toEqual([]);
    expect(state.currentUser).toBeNull();
    expect(state.error).toBeNull();
  });

  it('loads persisted users, selects the first as current, and hydrates favorites', async () => {
    const created = await useUserStore.getState().createUser({ username: 'Alice' });
    await userRepository.addFavoriteChannel(created.id, 'nrk1.no');

    // Simulate an app restart: store state gone, database persists.
    resetStores(useUserStore);
    await useUserStore.getState().loadUsers();
    await flushAsync();

    const state = useUserStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.users).toHaveLength(1);
    expect(state.currentUser?.id).toBe(created.id);
    expect(state.currentUser?.settings?.theme).toBe('system');
    expect(state.favoriteChannels).toEqual(['nrk1.no']);
  });
});

describe('createUser', () => {
  it('makes the first created user the current user', async () => {
    const user = await useUserStore.getState().createUser({ username: 'Alice' });

    const state = useUserStore.getState();
    expect(state.users).toHaveLength(1);
    expect(state.currentUser?.id).toBe(user.id);
    expect(state.isLoading).toBe(false);

    // Persisted with default settings, not just held in memory.
    const persisted = await userRepository.getUserById(user.id);
    expect(persisted?.username).toBe('Alice');
    expect(persisted?.settings?.playlistSharingEnabled).toBe(true);
  });

  it('does not steal currentUser when a second user is created', async () => {
    const first = await useUserStore.getState().createUser({ username: 'Alice' });
    await useUserStore.getState().createUser({ username: 'Bob' });

    const state = useUserStore.getState();
    expect(state.users).toHaveLength(2);
    expect(state.currentUser?.id).toBe(first.id);
  });
});

describe('switchUser', () => {
  it('switches currentUser and reloads favorites for the new user', async () => {
    const alice = await useUserStore.getState().createUser({ username: 'Alice' });
    const bob = await useUserStore.getState().createUser({ username: 'Bob' });
    await useUserStore.getState().toggleFavorite(alice.id, 'ch-alice');
    await userRepository.addFavoriteChannel(bob.id, 'ch-bob');
    expect(useUserStore.getState().favoriteChannels).toEqual(['ch-alice']);

    await useUserStore.getState().switchUser(bob.id);
    await flushAsync();

    const state = useUserStore.getState();
    expect(state.currentUser?.id).toBe(bob.id);
    expect(state.isLoading).toBe(false);
    expect(state.favoriteChannels).toEqual(['ch-bob']);

    // The dependent stores were reloaded for the new user.
    expect(usePlaylistStore.getState().isInitialized).toBe(true);
    expect(useHeaderBackgroundStore.getState().isLoaded).toBe(true);

    // lastActiveAt is bumped in the database.
    const persisted = await userRepository.getUserById(bob.id);
    expect(persisted?.lastActiveAt).toBeDefined();
  });

  it('sets error state and throws for an unknown user id', async () => {
    const alice = await useUserStore.getState().createUser({ username: 'Alice' });

    await expect(useUserStore.getState().switchUser('missing-id')).rejects.toThrow(
      'User with id missing-id not found',
    );

    const state = useUserStore.getState();
    expect(state.error).toBe('User with id missing-id not found');
    expect(state.isLoading).toBe(false);
    expect(state.currentUser?.id).toBe(alice.id);
  });
});

describe('updateUser', () => {
  it('updates the user in both the list and currentUser', async () => {
    const user = await useUserStore.getState().createUser({ username: 'Alice' });

    await useUserStore.getState().updateUser(user.id, { username: 'Alicia' });

    const state = useUserStore.getState();
    expect(state.users[0].username).toBe('Alicia');
    expect(state.currentUser?.username).toBe('Alicia');
    expect((await userRepository.getUserById(user.id))?.username).toBe('Alicia');
  });
});

describe('deleteUser', () => {
  it('falls back to the first remaining user when deleting the current one', async () => {
    const alice = await useUserStore.getState().createUser({ username: 'Alice' });
    const bob = await useUserStore.getState().createUser({ username: 'Bob' });
    expect(useUserStore.getState().currentUser?.id).toBe(alice.id);

    await useUserStore.getState().deleteUser(alice.id);

    const state = useUserStore.getState();
    expect(state.users.map((u) => u.id)).toEqual([bob.id]);
    expect(state.currentUser?.id).toBe(bob.id);
    expect(await userRepository.getUserById(alice.id)).toBeNull();
  });

  it('keeps currentUser when deleting a different user', async () => {
    const alice = await useUserStore.getState().createUser({ username: 'Alice' });
    const bob = await useUserStore.getState().createUser({ username: 'Bob' });

    await useUserStore.getState().deleteUser(bob.id);

    const state = useUserStore.getState();
    expect(state.users.map((u) => u.id)).toEqual([alice.id]);
    expect(state.currentUser?.id).toBe(alice.id);
  });
});

describe('updateSettings', () => {
  it('persists settings and refreshes the user in state', async () => {
    const user = await useUserStore.getState().createUser({ username: 'Alice' });

    await useUserStore.getState().updateSettings(user.id, {
      theme: 'dark',
      activePlaylistId: 'pl-9',
    });

    const state = useUserStore.getState();
    expect(state.currentUser?.settings?.theme).toBe('dark');
    expect(state.currentUser?.settings?.activePlaylistId).toBe('pl-9');

    const persisted = await userRepository.getUserSettings(user.id);
    expect(persisted?.theme).toBe('dark');
    expect(persisted?.activePlaylistId).toBe('pl-9');
  });
});

describe('toggleFavorite', () => {
  it('adds a favorite to state and persists it', async () => {
    const user = await useUserStore.getState().createUser({ username: 'Alice' });

    await useUserStore.getState().toggleFavorite(user.id, 'nrk1.no');

    expect(useUserStore.getState().favoriteChannels).toEqual(['nrk1.no']);
    expect(await useUserStore.getState().isFavorite(user.id, 'nrk1.no')).toBe(true);
  });

  it('removes the favorite on a second toggle', async () => {
    const user = await useUserStore.getState().createUser({ username: 'Alice' });

    await useUserStore.getState().toggleFavorite(user.id, 'nrk1.no');
    await useUserStore.getState().toggleFavorite(user.id, 'nrk1.no');

    expect(useUserStore.getState().favoriteChannels).toEqual([]);
    expect(await useUserStore.getState().isFavorite(user.id, 'nrk1.no')).toBe(false);
  });
});

describe('viewing sessions', () => {
  it('startViewingSession sets activeSessionId and endViewingSession clears it', async () => {
    const user = await useUserStore.getState().createUser({ username: 'Alice' });

    const sessionId = await useUserStore.getState().startViewingSession({
      userId: user.id,
      playlistId: PLAYLIST_ID,
      channelId: 'nrk1.no',
      channelName: 'NRK1 HD',
      groupTitle: 'Norway',
      contentType: 'live',
    });
    expect(useUserStore.getState().activeSessionId).toBe(sessionId);

    await useUserStore.getState().endViewingSession(sessionId, 600, 600, true);
    expect(useUserStore.getState().activeSessionId).toBeNull();

    const history = await useUserStore.getState().getViewingHistory(user.id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      channelId: 'nrk1.no',
      channelName: 'NRK1 HD',
      completed: true,
      durationWatched: 600,
    });
  });

  it('round-trips a resumable position through getSavedPosition and getContinueWatching', async () => {
    const user = await useUserStore.getState().createUser({ username: 'Alice' });
    await watchChannel(user.id, BREAKING_BAD_S01E01, {
      endPosition: 500,
      totalDuration: 1000,
      completed: false,
    });

    const saved = await useUserStore
      .getState()
      .getSavedPosition(user.id, PLAYLIST_ID, BREAKING_BAD_S01E01_ID);
    expect(saved).toEqual({ lastPosition: 500, totalDuration: 1000 });

    const continueWatching = await useUserStore
      .getState()
      .getContinueWatching(user.id, PLAYLIST_ID);
    expect(continueWatching).toHaveLength(1);
    expect(continueWatching[0]).toMatchObject({
      channelId: BREAKING_BAD_S01E01_ID,
      lastPosition: 500,
      totalDuration: 1000,
    });
  });
});

describe('resolveAndStoreNextEpisode', () => {
  it('stores S01E02 as the next episode after completing S01E01', async () => {
    const user = await useUserStore.getState().createUser({ username: 'Alice' });
    await importBasicPlaylist();
    await watchChannel(user.id, BREAKING_BAD_S01E01);
    expect(useUserStore.getState().recentlyWatchedVersion).toBe(0);

    await useUserStore
      .getState()
      .resolveAndStoreNextEpisode(user.id, PLAYLIST_ID, BREAKING_BAD_S01E01);

    expect(useUserStore.getState().recentlyWatchedVersion).toBe(1);

    const recent = await useUserStore.getState().getRecentlyWatched(user.id, PLAYLIST_ID);
    expect(recent).toHaveLength(1);
    expect(recent[0].nextEpisodeChannelName).toBe('Breaking Bad S01E02');
    expect(recent[0].nextEpisodeChannelId).toBe(
      'Breaking Bad S01E02|http://stream.example.com/series/breaking-bad/s01e02.mkv',
    );
  });

  it('stores nothing for the last episode of a series', async () => {
    const lastEpisode: Channel = {
      name: 'Breaking Bad S02E01',
      url: 'http://stream.example.com/series/breaking-bad/s02e01.mkv',
      tvg: { name: 'Breaking Bad' },
      group: { title: 'Series | Drama' },
    };
    const user = await useUserStore.getState().createUser({ username: 'Alice' });
    await importBasicPlaylist();
    await watchChannel(user.id, lastEpisode);

    await useUserStore.getState().resolveAndStoreNextEpisode(user.id, PLAYLIST_ID, lastEpisode);

    expect(useUserStore.getState().recentlyWatchedVersion).toBe(0);
    const recent = await useUserStore.getState().getRecentlyWatched(user.id, PLAYLIST_ID);
    expect(recent[0].nextEpisodeChannelId).toBeUndefined();
  });
});

describe('clearError', () => {
  it('resets the error state', async () => {
    await useUserStore.getState().createUser({ username: 'Alice' });
    await expect(useUserStore.getState().switchUser('missing-id')).rejects.toThrow();
    expect(useUserStore.getState().error).not.toBeNull();

    useUserStore.getState().clearError();

    expect(useUserStore.getState().error).toBeNull();
  });
});
