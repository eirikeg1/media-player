/**
 * Integration tests for the user store: real zustand store driving the real
 * user repository against the in-memory SQLite fake, plus the Rust-backend
 * fake for series-episode resolution. Only the native file-system boundary is
 * mocked.
 */
import { playlistRepository } from '@/db/playlist-repository';
import { userRepository } from '@/db/user-repository';
import { getRustDatabase } from '@/services/rust-channel-service';
import { useFirstPageCacheStore } from '@/stores/cache';
import { useHeaderBackgroundStore } from '@/stores/header-background/header-background-store';
import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import { selectExcludeAdult, useUserStore } from '@/stores/user/user-store';
import { makePlaylist, makePlaylistMetadata } from '@/test/factories';
import { Database as M3uDatabaseFake, __registerRemoteM3u } from '@/test/fakes/m3u-database-fake';
import { BASIC_M3U, BASIC_M3U_COUNTS } from '@/test/fixtures';
import { flushAsync, resetStores, resetTestDatabases } from '@/test/helpers';
import type { Channel } from '@/types/playlist.types';
import type { User } from '@/types/user.types';

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
  resetStores(useUserStore, usePlaylistStore, useHeaderBackgroundStore, useFirstPageCacheStore);
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

  it('loads persisted users and selects the first as current', async () => {
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
    // Hydration is the caller's job (runInit), so loadUsers leaves it alone.
    expect(state.favoriteChannels).toEqual([]);

    await useUserStore.getState().loadFavoriteChannels(created.id);
    expect(useUserStore.getState().favoriteChannels).toEqual(['nrk1.no']);
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

describe('hydrateForUser', () => {
  it('replaces the previous user\'s favourites and reactions', async () => {
    const alice = await useUserStore.getState().createUser({ username: 'Alice' });
    const bob = await useUserStore.getState().createUser({ username: 'Bob' });
    await useUserStore.getState().toggleFavorite(alice.id, 'ch-alice');
    await useUserStore.getState().setReaction(alice.id, 'movie-1', 1);
    await userRepository.addFavoriteChannel(bob.id, 'ch-bob');

    await useUserStore.getState().hydrateForUser(bob.id);

    const state = useUserStore.getState();
    expect(state.favoriteChannels).toEqual(['ch-bob']);
    expect(state.contentReactions).toEqual({});
    expect(useHeaderBackgroundStore.getState().isLoaded).toBe(true);
  });

  it('lets the latest hydration win when two overlap', async () => {
    const alice = await useUserStore.getState().createUser({ username: 'Alice' });
    const bob = await useUserStore.getState().createUser({ username: 'Bob' });
    await userRepository.addFavoriteChannel(alice.id, 'ch-alice');
    await userRepository.addFavoriteChannel(bob.id, 'ch-bob');

    await Promise.all([
      useUserStore.getState().hydrateForUser(alice.id),
      useUserStore.getState().hydrateForUser(bob.id),
    ]);
    await flushAsync();

    expect(useUserStore.getState().favoriteChannels).toEqual(['ch-bob']);
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

  it('drops the first-page cache built for the previous user', async () => {
    const alice = await useUserStore.getState().createUser({ username: 'Alice' });
    const bob = await useUserStore.getState().createUser({ username: 'Bob' });
    await importBasicPlaylist();
    // The playlist metadata lives in iptv.db; `loadPlaylists` reads it from
    // there to decide which playlist is active.
    await playlistRepository.create(makePlaylist({ id: PLAYLIST_ID, url: PLAYLIST_URL }));
    await usePlaylistStore.getState().loadPlaylists();
    useFirstPageCacheStore.getState().setCachedChannels(PLAYLIST_ID, 'live', [], 1, false);
    expect(
      useFirstPageCacheStore.getState().getCachedChannels(PLAYLIST_ID, 'live', false),
    ).not.toBeNull();

    await useUserStore.getState().switchUser(bob.id);

    // Cached pages were sorted with Alice's favourites; Bob gets a fresh
    // pre-fetch instead (the fixture has live channels, so it is populated).
    const cached = useFirstPageCacheStore.getState().getCachedChannels(PLAYLIST_ID, 'live', false);
    expect(cached?.totalCount).toBe(BASIC_M3U_COUNTS.live);
    expect(useUserStore.getState().currentUser?.id).toBe(bob.id);
    expect(alice.id).not.toBe(bob.id);
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

  it('treats a repeated switch to the same user as the one already running', async () => {
    await useUserStore.getState().createUser({ username: 'Alice' });
    const bob = await useUserStore.getState().createUser({ username: 'Bob' });
    const updateLastActive = jest.spyOn(userRepository, 'updateLastActive');

    // A double tap on the same profile card.
    await Promise.all([
      useUserStore.getState().switchUser(bob.id),
      useUserStore.getState().switchUser(bob.id),
    ]);

    // One switch, not two interleaved sequences of dependent writes.
    expect(updateLastActive).toHaveBeenCalledTimes(1);
    expect(useUserStore.getState().currentUser?.id).toBe(bob.id);
  });

  it('runs two different switches one after another, last one winning', async () => {
    const alice = await useUserStore.getState().createUser({ username: 'Alice' });
    const bob = await useUserStore.getState().createUser({ username: 'Bob' });
    await userRepository.addFavoriteChannel(alice.id, 'ch-alice');
    await userRepository.addFavoriteChannel(bob.id, 'ch-bob');

    await Promise.all([
      useUserStore.getState().switchUser(bob.id),
      useUserStore.getState().switchUser(alice.id),
    ]);
    await flushAsync();

    // Interleaved, the two would leave one user current with the other's
    // favourites on screen.
    const state = useUserStore.getState();
    expect(state.currentUser?.id).toBe(alice.id);
    expect(state.favoriteChannels).toEqual(['ch-alice']);
    expect(state.isLoading).toBe(false);
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

  it('reloads the playlists and drops the cached pages, like a switch does', async () => {
    const alice = await useUserStore.getState().createUser({ username: 'Alice' });
    const bob = await useUserStore.getState().createUser({ username: 'Bob' });
    await importBasicPlaylist();
    await playlistRepository.create(
      makePlaylist({ id: PLAYLIST_ID, url: PLAYLIST_URL, createdByUserId: bob.id }),
    );
    await usePlaylistStore.getState().loadPlaylists();
    useFirstPageCacheStore.getState().setCachedChannels(PLAYLIST_ID, 'live', [], 1, false);

    await useUserStore.getState().deleteUser(alice.id);

    // Bob took over: the list and the pages cached from it were rebuilt for him
    // rather than left as Alice's (a page cached with her favourites and her
    // adult filter belongs to nobody now).
    const cached = useFirstPageCacheStore.getState().getCachedChannels(PLAYLIST_ID, 'live', false);
    expect(cached?.totalCount).toBe(BASIC_M3U_COUNTS.live);
    expect(usePlaylistStore.getState().playlists.map((p) => p.id)).toEqual([PLAYLIST_ID]);
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
    await expect(userRepository.getFavoriteChannels(user.id)).resolves.toEqual(['nrk1.no']);
  });

  it('removes the favorite on a second toggle', async () => {
    const user = await useUserStore.getState().createUser({ username: 'Alice' });

    await useUserStore.getState().toggleFavorite(user.id, 'nrk1.no');
    await useUserStore.getState().toggleFavorite(user.id, 'nrk1.no');

    expect(useUserStore.getState().favoriteChannels).toEqual([]);
    await expect(userRepository.getFavoriteChannels(user.id)).resolves.toEqual([]);
  });

  it('shows the change immediately and settles on one entry per channel', async () => {
    const user = await useUserStore.getState().createUser({ username: 'Alice' });

    // Not awaited: the star has to flip on the tap, not on the round-trip.
    const pending = useUserStore.getState().toggleFavorite(user.id, 'nrk1.no');
    expect(useUserStore.getState().favoriteChannels).toEqual(['nrk1.no']);
    await pending;

    // A repeated add (a double-tap racing its own write) must not duplicate it.
    await useUserStore.getState().toggleFavorite(user.id, 'nrk2.no');
    expect(useUserStore.getState().favoriteChannels).toEqual(['nrk2.no', 'nrk1.no']);
    const persisted = await userRepository.getFavoriteChannels(user.id);
    expect([...persisted].sort()).toEqual(['nrk1.no', 'nrk2.no']);
  });

  it('rolls the optimistic update back when the write fails', async () => {
    const user = await useUserStore.getState().createUser({ username: 'Alice' });
    await useUserStore.getState().toggleFavorite(user.id, 'nrk1.no');
    jest
      .spyOn(userRepository, 'addFavoriteChannel')
      .mockRejectedValueOnce(new Error('database is locked'));

    await expect(
      useUserStore.getState().toggleFavorite(user.id, 'nrk2.no'),
    ).rejects.toThrow('database is locked');

    expect(useUserStore.getState().favoriteChannels).toEqual(['nrk1.no']);
  });

  it('reverts only the failed id, keeping a toggle that landed in between', async () => {
    const user = await useUserStore.getState().createUser({ username: 'Alice' });
    jest
      .spyOn(userRepository, 'addFavoriteChannel')
      .mockImplementationOnce(async () => {
        throw new Error('database is locked');
      });

    const failing = useUserStore.getState().toggleFavorite(user.id, 'nrk1.no');
    // A second star tapped while the first write is in flight.
    const succeeding = useUserStore.getState().toggleFavorite(user.id, 'nrk2.no');

    await expect(failing).rejects.toThrow('database is locked');
    await succeeding;

    // Restoring the whole list would have wiped the second toggle.
    expect(useUserStore.getState().favoriteChannels).toEqual(['nrk2.no']);
    await expect(userRepository.getFavoriteChannels(user.id)).resolves.toEqual(['nrk2.no']);
  });

  it('leaves the list alone once another user became current', async () => {
    const alice = await useUserStore.getState().createUser({ username: 'Alice' });
    const bob = await useUserStore.getState().createUser({ username: 'Bob' });
    await useUserStore.getState().switchUser(bob.id);
    await flushAsync();

    // A star tapped on a screen that belonged to Alice: the write is hers, but
    // the list on screen is Bob's.
    await useUserStore.getState().toggleFavorite(alice.id, 'nrk1.no');

    expect(useUserStore.getState().favoriteChannels).toEqual([]);
    await expect(userRepository.getFavoriteChannels(alice.id)).resolves.toEqual(['nrk1.no']);
  });
});

describe('selectExcludeAdult', () => {
  it('fails closed until the settings are known', () => {
    // A query that runs before the user's settings have loaded must not be the
    // reason adult content shows up.
    expect(selectExcludeAdult(null)).toBe(true);
    expect(selectExcludeAdult(undefined)).toBe(true);
    expect(selectExcludeAdult({ id: 'u-1' } as User)).toBe(true);
  });

  it('follows the setting once it is there', () => {
    const withSetting = (parentalControlEnabled: boolean) =>
      ({ id: 'u-1', settings: { parentalControlEnabled } }) as User;

    expect(selectExcludeAdult(withSetting(false))).toBe(false);
    expect(selectExcludeAdult(withSetting(true))).toBe(true);
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
