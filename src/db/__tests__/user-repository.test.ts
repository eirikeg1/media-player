/**
 * Behavioral tests for the user repository against real SQLite. Covers user
 * CRUD, settings persistence, favorites/hidden/groups, channel ordering, and
 * the viewing-history aggregation pipeline (sessions -> watch stats).
 *
 * Fake timers (with setSystemTime) give every write a distinct, deterministic
 * timestamp so ordering and timestamp assertions are stable.
 */
import { userRepository } from '@/db/user-repository';
import { executeQuery, executeQuerySingle, executeStatement } from '@/db/sqlite-client';
import { COMPLETION_RATIO, RESUME_MIN_SECONDS } from '@/lib/viewing-progress';
import type { ContentType, User } from '@/types/user.types';
import { DEFAULT_USER_SETTINGS } from '@/types/user.types';
import { FACTORY_NOW as BASE_TIME } from '@/test/factories';
import { resetTestDatabases, tick } from '@/test/helpers';

const PLAYLIST_ID = 'playlist-1';

async function createUser(username = 'Alice'): Promise<User> {
  return userRepository.createUser({ username });
}

/**
 * The favorites/hidden/order tables have foreign keys to the legacy
 * `channels` table, which the test database enforces. Seed referenced
 * channel rows (and their parent playlist) before using those tables.
 */
async function seedChannels(...channelIds: string[]): Promise<void> {
  const now = new Date().toISOString();
  await executeStatement(
    'INSERT OR IGNORE INTO playlists (id, name, url, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)',
    [PLAYLIST_ID, 'Seed Playlist', 'https://iptv.example.com/seed.m3u', now, now],
  );
  for (const channelId of channelIds) {
    await executeStatement(
      'INSERT OR IGNORE INTO channels (id, playlistId, name, url) VALUES (?, ?, ?, ?)',
      [channelId, PLAYLIST_ID, channelId, `http://stream.example.com/${encodeURIComponent(channelId)}.m3u8`],
    );
  }
}

interface ChannelStatsRow {
  userId: string;
  playlistId: string;
  channelId: string;
  channelName: string;
  groupTitle: string | null;
  watchCount: number;
  totalTimeWatched: number;
  lastWatchedAt: string;
  firstWatchedAt: string;
  lastPosition: number;
  totalDuration: number | null;
  completionCount: number;
  avgSessionDuration: number;
  longestSessionDuration: number;
  nextEpisodeChannelId: string | null;
  nextEpisodeChannelName: string | null;
}

async function getChannelStatsRow(
  userId: string,
  channelId: string,
  playlistId = PLAYLIST_ID,
): Promise<ChannelStatsRow | null> {
  return executeQuerySingle<ChannelStatsRow>(
    'SELECT * FROM channel_watch_stats WHERE userId = ? AND playlistId = ? AND channelId = ?',
    [userId, playlistId, channelId],
  );
}

interface GroupStatsRow {
  userId: string;
  playlistId: string;
  groupTitle: string;
  watchCount: number;
  totalTimeWatched: number;
  uniqueChannelsWatched: number;
  lastWatchedAt: string;
}

async function getGroupStatsRow(
  userId: string,
  groupTitle: string,
  playlistId = PLAYLIST_ID,
): Promise<GroupStatsRow | null> {
  return executeQuerySingle<GroupStatsRow>(
    'SELECT * FROM group_watch_stats WHERE userId = ? AND playlistId = ? AND groupTitle = ?',
    [userId, playlistId, groupTitle],
  );
}

/** Run a full start -> progress -> end session lifecycle. */
async function watchSession(params: {
  userId: string;
  channelId: string;
  playlistId?: string;
  channelName?: string;
  groupTitle?: string;
  contentType?: ContentType;
  durationWatched?: number;
  endPosition?: number;
  totalDuration?: number;
  completed?: boolean;
}): Promise<string> {
  const endPosition = params.endPosition ?? 0;
  const durationWatched = params.durationWatched ?? 0;

  const sessionId = await userRepository.startViewingSession({
    userId: params.userId,
    playlistId: params.playlistId ?? PLAYLIST_ID,
    channelId: params.channelId,
    channelName: params.channelName ?? params.channelId,
    groupTitle: params.groupTitle,
    contentType: params.contentType ?? 'movie',
    totalDuration: params.totalDuration,
  });
  await userRepository.updateSessionProgress(sessionId, endPosition, durationWatched);
  await userRepository.endViewingSession(
    sessionId,
    endPosition,
    durationWatched,
    params.completed ?? false,
  );
  return sessionId;
}

beforeEach(async () => {
  jest.useFakeTimers();
  jest.setSystemTime(BASE_TIME);
  await resetTestDatabases();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('createUser', () => {
  it('persists the user with default settings', async () => {
    const user = await createUser('Alice');

    expect(user.id).toBeTruthy();
    expect(user.username).toBe('Alice');
    expect(user.createdAt).toEqual(BASE_TIME);
    expect(user.updatedAt).toEqual(BASE_TIME);
    expect(user.lastActiveAt).toEqual(BASE_TIME);
    expect(user.settings).toEqual({ userId: user.id, ...DEFAULT_USER_SETTINGS });

    const settingsRow = await executeQuerySingle<{ parentalControlEnabled: number }>(
      'SELECT parentalControlEnabled FROM user_settings WHERE userId = ?',
      [user.id],
    );
    expect(settingsRow?.parentalControlEnabled).toBe(
      DEFAULT_USER_SETTINGS.parentalControlEnabled ? 1 : 0,
    );
  });

  it('stores optional avatarUrl and pin', async () => {
    const user = await userRepository.createUser({
      username: 'Bob',
      avatarUrl: 'https://avatars.example.com/bob.png',
      pin: '1234',
    });

    const fetched = await userRepository.getUserById(user.id);
    expect(fetched?.avatarUrl).toBe('https://avatars.example.com/bob.png');
    expect(fetched?.pin).toBe('1234');
  });
});

describe('getAllUsers', () => {
  it('returns an empty array when there are no users', async () => {
    await expect(userRepository.getAllUsers()).resolves.toEqual([]);
  });

  it('orders users by createdAt ascending', async () => {
    await createUser('First');
    tick();
    await createUser('Second');
    tick();
    await createUser('Third');

    const users = await userRepository.getAllUsers();
    expect(users.map((u) => u.username)).toEqual(['First', 'Second', 'Third']);
    expect(users[0].settings).toBeDefined();
  });
});

describe('getUserById', () => {
  it('returns null for a missing id', async () => {
    await expect(userRepository.getUserById('missing-id')).resolves.toBeNull();
  });
});

describe('updateUser', () => {
  it('applies partial updates and bumps updatedAt', async () => {
    const user = await userRepository.createUser({
      username: 'Alice',
      avatarUrl: 'https://avatars.example.com/alice.png',
    });
    tick();

    const updated = await userRepository.updateUser(user.id, { username: 'Alicia' });

    expect(updated.username).toBe('Alicia');
    expect(updated.avatarUrl).toBe('https://avatars.example.com/alice.png');
    expect(updated.createdAt).toEqual(BASE_TIME);
    expect(updated.updatedAt.getTime()).toBeGreaterThan(BASE_TIME.getTime());
  });

  it('throws for a missing id', async () => {
    await expect(userRepository.updateUser('missing-id', { username: 'X' })).rejects.toThrow(
      'User with id missing-id not found',
    );
  });
});

describe('deleteUser', () => {
  it('removes the user', async () => {
    const user = await createUser();

    await userRepository.deleteUser(user.id);

    await expect(userRepository.getUserById(user.id)).resolves.toBeNull();
  });

  it('throws for a missing id', async () => {
    await expect(userRepository.deleteUser('missing-id')).rejects.toThrow(
      'User with id missing-id not found',
    );
  });

  it('hands the deleted user\'s playlists over as shared, not dangling', async () => {
    const alice = await createUser('Alice');
    const bob = await createUser('Bob');
    const now = new Date().toISOString();
    for (const [id, owner] of [['pl-alice', alice.id], ['pl-bob', bob.id]]) {
      await executeStatement(
        'INSERT INTO playlists (id, name, url, createdByUserId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
        [id, id, `https://iptv.example.com/${id}.m3u`, owner, now, now],
      );
    }

    await userRepository.deleteUser(alice.id);

    // A dangling createdByUserId would hide the playlist from everyone; NULL
    // means "shared", so Bob keeps seeing it (and its imported channels).
    const visible = await executeQuery<{ id: string }>(
      'SELECT id FROM playlists WHERE createdByUserId IS NULL',
    );
    expect(visible.map((row) => row.id)).toEqual(['pl-alice']);
    const bobsPlaylist = await executeQuerySingle<{ createdByUserId: string | null }>(
      'SELECT createdByUserId FROM playlists WHERE id = ?',
      ['pl-bob'],
    );
    expect(bobsPlaylist?.createdByUserId).toBe(bob.id);
  });
});

describe('updateLastActive', () => {
  it('moves lastActiveAt forward', async () => {
    const user = await createUser();
    tick(60_000);

    await userRepository.updateLastActive(user.id);

    const fetched = await userRepository.getUserById(user.id);
    expect(fetched?.lastActiveAt?.getTime()).toBe(BASE_TIME.getTime() + 60_000);
  });
});

describe('user settings', () => {
  it('returns null for a user without settings', async () => {
    await expect(userRepository.getUserSettings('missing-id')).resolves.toBeNull();
  });

  it('merges partial updates with existing settings', async () => {
    const user = await createUser();

    const updated = await userRepository.updateUserSettings(user.id, { theme: 'dark' });
    expect(updated.theme).toBe('dark');
    expect(updated.language).toBe(DEFAULT_USER_SETTINGS.language);
    expect(updated.channelSortBy).toBe(DEFAULT_USER_SETTINGS.channelSortBy);

    const persisted = await userRepository.getUserSettings(user.id);
    expect(persisted).toEqual({ userId: user.id, ...DEFAULT_USER_SETTINGS, theme: 'dark' });
  });

  it('round-trips booleans through INTEGER columns', async () => {
    const user = await createUser();

    await userRepository.updateUserSettings(user.id, {
      parentalControlEnabled: false,
      showLiveTab: false,
    });

    const row = await executeQuerySingle<{ parentalControlEnabled: number; showLiveTab: number }>(
      'SELECT parentalControlEnabled, showLiveTab FROM user_settings WHERE userId = ?',
      [user.id],
    );
    expect(row).toEqual({ parentalControlEnabled: 0, showLiveTab: 0 });

    let settings = await userRepository.getUserSettings(user.id);
    expect(settings?.parentalControlEnabled).toBe(false);
    expect(settings?.showLiveTab).toBe(false);

    await userRepository.updateUserSettings(user.id, { parentalControlEnabled: true });
    settings = await userRepository.getUserSettings(user.id);
    expect(settings?.parentalControlEnabled).toBe(true);
    expect(settings?.showLiveTab).toBe(false);
  });

  it('writes only the patched columns, so a stale read cannot clobber others', async () => {
    const user = await createUser();

    // Genuinely concurrent: two switches toggled in the same moment. Each reads
    // the row before writing, so a full-row write would resurrect what it read
    // and undo the other's change.
    const [afterTheme, afterTab] = await Promise.all([
      userRepository.updateUserSettings(user.id, { theme: 'dark' }),
      userRepository.updateUserSettings(user.id, { showLiveTab: false }),
    ]);
    expect(afterTheme.theme).toBe('dark');
    expect(afterTab.showLiveTab).toBe(false);

    const persisted = await userRepository.getUserSettings(user.id);
    expect(persisted?.theme).toBe('dark');
    expect(persisted?.showLiveTab).toBe(false);
  });

  it('ignores an explicit undefined for a column that cannot be null', async () => {
    const user = await createUser();
    await userRepository.updateUserSettings(user.id, { theme: 'dark', showLiveTab: false });

    // A caller spreading optional fields ends up passing `undefined`; writing it
    // would either violate NOT NULL or store a coerced 0/'undefined'.
    const updated = await userRepository.updateUserSettings(user.id, {
      theme: undefined,
      showLiveTab: undefined,
    });

    expect(updated).toMatchObject({ theme: 'dark', showLiveTab: false });
    const persisted = await userRepository.getUserSettings(user.id);
    expect(persisted?.theme).toBe('dark');
    expect(persisted?.showLiveTab).toBe(false);
  });

  it('still clears a nullable column when the patch carries undefined', async () => {
    const user = await createUser();
    await userRepository.updateUserSettings(user.id, {
      activePlaylistId: 'pl-1',
      parentalControlPin: '1234',
    });

    const updated = await userRepository.updateUserSettings(user.id, {
      activePlaylistId: undefined,
      parentalControlPin: undefined,
    });

    expect(updated.activePlaylistId).toBeUndefined();
    const persisted = await userRepository.getUserSettings(user.id);
    expect(persisted?.activePlaylistId).toBeUndefined();
    expect(persisted?.parentalControlPin).toBeUndefined();
  });

  it('accepts an empty patch without touching the row', async () => {
    const user = await createUser();

    const updated = await userRepository.updateUserSettings(user.id, {});

    expect(updated).toEqual({ userId: user.id, ...DEFAULT_USER_SETTINGS });
  });

  it('throws when updating settings for a missing user', async () => {
    await expect(
      userRepository.updateUserSettings('missing-id', { theme: 'dark' }),
    ).rejects.toThrow('Settings for user missing-id not found');
  });
});

describe('favorite channels', () => {
  beforeEach(async () => {
    await seedChannels('ch-1', 'ch-old', 'ch-new');
  });

  it('round-trips add/is/remove', async () => {
    const user = await createUser();

    await expect(userRepository.isFavoriteChannel(user.id, 'ch-1')).resolves.toBe(false);

    await userRepository.addFavoriteChannel(user.id, 'ch-1');
    await expect(userRepository.isFavoriteChannel(user.id, 'ch-1')).resolves.toBe(true);
    await expect(userRepository.getFavoriteChannels(user.id)).resolves.toEqual(['ch-1']);

    await userRepository.removeFavoriteChannel(user.id, 'ch-1');
    await expect(userRepository.isFavoriteChannel(user.id, 'ch-1')).resolves.toBe(false);
    await expect(userRepository.getFavoriteChannels(user.id)).resolves.toEqual([]);
  });

  it('ignores duplicate adds (INSERT OR IGNORE)', async () => {
    const user = await createUser();

    await userRepository.addFavoriteChannel(user.id, 'ch-1');
    await userRepository.addFavoriteChannel(user.id, 'ch-1');

    const rows = await executeQuery(
      'SELECT * FROM user_favorite_channels WHERE userId = ? AND channelId = ?',
      [user.id, 'ch-1'],
    );
    expect(rows).toHaveLength(1);
  });

  it('orders favorites by addedAt descending', async () => {
    const user = await createUser();

    await userRepository.addFavoriteChannel(user.id, 'ch-old');
    tick();
    await userRepository.addFavoriteChannel(user.id, 'ch-new');

    await expect(userRepository.getFavoriteChannels(user.id)).resolves.toEqual([
      'ch-new',
      'ch-old',
    ]);
  });

  it('isolates favorites per user', async () => {
    const alice = await createUser('Alice');
    const bob = await createUser('Bob');

    await userRepository.addFavoriteChannel(alice.id, 'ch-1');

    await expect(userRepository.getFavoriteChannels(bob.id)).resolves.toEqual([]);
    await expect(userRepository.isFavoriteChannel(bob.id, 'ch-1')).resolves.toBe(false);
  });
});

describe('content reactions', () => {
  it('stores a like and returns it with its timestamp', async () => {
    const user = await createUser();

    await userRepository.setContentReaction(user.id, 'movie-1', 1);

    await expect(userRepository.getContentReactions(user.id)).resolves.toEqual([
      { channelId: 'movie-1', reaction: 1, createdAt: BASE_TIME.toISOString() },
    ]);
  });

  it('upserts so like and dislike are mutually exclusive', async () => {
    const user = await createUser();

    await userRepository.setContentReaction(user.id, 'movie-1', 1);
    tick();
    await userRepository.setContentReaction(user.id, 'movie-1', -1);

    const reactions = await userRepository.getContentReactions(user.id);
    expect(reactions).toEqual([
      {
        channelId: 'movie-1',
        reaction: -1,
        createdAt: new Date(BASE_TIME.getTime() + 1000).toISOString(),
      },
    ]);

    const rows = await executeQuery(
      'SELECT * FROM user_content_reactions WHERE userId = ? AND channelId = ?',
      [user.id, 'movie-1'],
    );
    expect(rows).toHaveLength(1);
  });

  it('deletes the row when the reaction is null', async () => {
    const user = await createUser();
    await userRepository.setContentReaction(user.id, 'movie-1', 1);
    await userRepository.setContentReaction(user.id, 'series:Some Show', -1);

    await userRepository.setContentReaction(user.id, 'movie-1', null);

    await expect(userRepository.getContentReactions(user.id)).resolves.toEqual([
      { channelId: 'series:Some Show', reaction: -1, createdAt: BASE_TIME.toISOString() },
    ]);
  });

  it('clearing a reaction that does not exist is a no-op', async () => {
    const user = await createUser();

    await userRepository.setContentReaction(user.id, 'movie-1', null);

    await expect(userRepository.getContentReactions(user.id)).resolves.toEqual([]);
  });

  it('isolates reactions per user', async () => {
    const alice = await createUser('Alice');
    const bob = await createUser('Bob');

    await userRepository.setContentReaction(alice.id, 'movie-1', 1);
    await userRepository.setContentReaction(bob.id, 'movie-1', -1);

    await expect(userRepository.getContentReactions(alice.id)).resolves.toEqual([
      { channelId: 'movie-1', reaction: 1, createdAt: BASE_TIME.toISOString() },
    ]);
    await expect(userRepository.getContentReactions(bob.id)).resolves.toEqual([
      { channelId: 'movie-1', reaction: -1, createdAt: BASE_TIME.toISOString() },
    ]);
  });

  it('deleteUser removes the user\'s reactions', async () => {
    const user = await createUser();
    await userRepository.setContentReaction(user.id, 'movie-1', 1);

    await userRepository.deleteUser(user.id);

    const rows = await executeQuery(
      'SELECT * FROM user_content_reactions WHERE userId = ?',
      [user.id],
    );
    expect(rows).toEqual([]);
  });
});

describe('favorite groups', () => {
  it('round-trips add/is/remove with dedup', async () => {
    const user = await createUser();

    await userRepository.addFavoriteGroup(user.id, 'Sports');
    await userRepository.addFavoriteGroup(user.id, 'Sports');

    await expect(userRepository.isFavoriteGroup(user.id, 'Sports')).resolves.toBe(true);
    await expect(userRepository.getFavoriteGroups(user.id)).resolves.toEqual(['Sports']);

    await userRepository.removeFavoriteGroup(user.id, 'Sports');
    await expect(userRepository.isFavoriteGroup(user.id, 'Sports')).resolves.toBe(false);
    await expect(userRepository.getFavoriteGroups(user.id)).resolves.toEqual([]);
  });

  it('isolates favorite groups per user', async () => {
    const alice = await createUser('Alice');
    const bob = await createUser('Bob');

    await userRepository.addFavoriteGroup(alice.id, 'Sports');

    await expect(userRepository.getFavoriteGroups(bob.id)).resolves.toEqual([]);
  });
});

describe('viewing session lifecycle', () => {
  it('records a finalized session through start/progress/end', async () => {
    const user = await createUser();

    const sessionId = await userRepository.startViewingSession({
      userId: user.id,
      playlistId: PLAYLIST_ID,
      channelId: 'movie-1',
      channelName: 'Movie 1',
      groupTitle: 'Movies',
      contentType: 'movie',
      totalDuration: 1000,
    });
    tick(600_000);
    await userRepository.updateSessionProgress(sessionId, 500, 600);
    await userRepository.endViewingSession(sessionId, 600, 600, false);

    const [session] = await userRepository.getViewingHistory(user.id);
    expect(session).toMatchObject({
      id: sessionId,
      userId: user.id,
      playlistId: PLAYLIST_ID,
      channelId: 'movie-1',
      channelName: 'Movie 1',
      groupTitle: 'Movies',
      contentType: 'movie',
      startedAt: BASE_TIME.toISOString(),
      endedAt: new Date(BASE_TIME.getTime() + 600_000).toISOString(),
      durationWatched: 600,
      endPosition: 600,
      totalDuration: 1000,
      completed: false,
    });
  });

  it('updateSessionProgress keeps the existing totalDuration when not provided', async () => {
    const user = await createUser();
    const sessionId = await userRepository.startViewingSession({
      userId: user.id,
      playlistId: PLAYLIST_ID,
      channelId: 'movie-1',
      channelName: 'Movie 1',
      contentType: 'movie',
      totalDuration: 1000,
    });

    await userRepository.updateSessionProgress(sessionId, 100, 100);

    const [session] = await userRepository.getViewingHistory(user.id);
    expect(session.totalDuration).toBe(1000);
  });
});

describe('channel_watch_stats aggregation', () => {
  it('UPSERTs stats correctly across two sessions for the same channel', async () => {
    const user = await createUser();

    await watchSession({
      userId: user.id,
      channelId: 'movie-1',
      durationWatched: 600,
      endPosition: 500,
      totalDuration: 1000,
      completed: false,
    });
    const firstEndedAt = new Date(jest.now()).toISOString();
    tick(3_600_000);
    await watchSession({
      userId: user.id,
      channelId: 'movie-1',
      durationWatched: 300,
      endPosition: 800,
      totalDuration: 1000,
      completed: true,
    });

    const stats = await getChannelStatsRow(user.id, 'movie-1');
    expect(stats).toMatchObject({
      watchCount: 2,
      totalTimeWatched: 900,
      avgSessionDuration: 450,
      longestSessionDuration: 600,
      completionCount: 1,
      lastPosition: 800,
      totalDuration: 1000,
      firstWatchedAt: firstEndedAt,
      lastWatchedAt: new Date(jest.now()).toISOString(),
    });
  });

  it('aggregates group_watch_stats and counts unique channels once', async () => {
    const user = await createUser();

    await watchSession({
      userId: user.id,
      channelId: 'movie-1',
      groupTitle: 'Movies',
      durationWatched: 600,
    });
    tick();
    await watchSession({
      userId: user.id,
      channelId: 'movie-2',
      groupTitle: 'Movies',
      durationWatched: 300,
    });
    tick();
    // Re-watch movie-1: watchCount grows but uniqueChannelsWatched must not.
    await watchSession({
      userId: user.id,
      channelId: 'movie-1',
      groupTitle: 'Movies',
      durationWatched: 100,
    });

    const stats = await getGroupStatsRow(user.id, 'Movies');
    expect(stats).toMatchObject({
      watchCount: 3,
      totalTimeWatched: 1000,
      uniqueChannelsWatched: 2,
      lastWatchedAt: new Date(jest.now()).toISOString(),
    });
  });
});

describe('getContinueWatching', () => {
  it('returns in-progress items only, newest first', async () => {
    const user = await createUser();

    // Excluded: never progressed past position 0.
    await watchSession({ userId: user.id, channelId: 'untouched', totalDuration: 1000 });
    tick();
    // Included: halfway through.
    await watchSession({
      userId: user.id,
      channelId: 'halfway',
      endPosition: 500,
      durationWatched: 500,
      totalDuration: 1000,
    });
    tick();
    // Excluded: exactly at the 90% boundary counts as finished.
    await watchSession({
      userId: user.id,
      channelId: 'finished',
      endPosition: 900,
      durationWatched: 900,
      totalDuration: 1000,
      completed: true,
    });
    tick();
    // Included: unknown duration with progress.
    await watchSession({ userId: user.id, channelId: 'no-duration', endPosition: 120, durationWatched: 120 });

    const items = await userRepository.getContinueWatching(user.id, PLAYLIST_ID);
    expect(items.map((item) => item.channelId)).toEqual(['no-duration', 'halfway']);
    expect(items[1]).toMatchObject({ lastPosition: 500, totalDuration: 1000 });
  });

  it('respects the limit parameter', async () => {
    const user = await createUser();
    for (const channelId of ['a', 'b', 'c']) {
      await watchSession({
        userId: user.id,
        channelId,
        endPosition: 100,
        durationWatched: 100,
        totalDuration: 1000,
      });
      tick();
    }

    const items = await userRepository.getContinueWatching(user.id, PLAYLIST_ID, 2);
    expect(items).toHaveLength(2);
  });
});

describe('getRecentlyWatched', () => {
  it('orders by lastWatchedAt descending and exposes watch counts', async () => {
    const user = await createUser();

    await watchSession({ userId: user.id, channelId: 'older', durationWatched: 100 });
    tick();
    await watchSession({ userId: user.id, channelId: 'newer', durationWatched: 100 });
    tick();
    await watchSession({ userId: user.id, channelId: 'older', durationWatched: 100 });

    const items = await userRepository.getRecentlyWatched(user.id, PLAYLIST_ID);
    expect(items.map((item) => item.channelId)).toEqual(['older', 'newer']);
    expect(items[0].watchCount).toBe(2);
    expect(items[1].watchCount).toBe(1);
  });

  it('scopes results to the requested playlist', async () => {
    const user = await createUser();
    await watchSession({ userId: user.id, channelId: 'ch-a', playlistId: 'playlist-a' });
    await watchSession({ userId: user.id, channelId: 'ch-b', playlistId: 'playlist-b' });

    const items = await userRepository.getRecentlyWatched(user.id, 'playlist-a');
    expect(items.map((item) => item.channelId)).toEqual(['ch-a']);
  });

  it('drops live channels when asked, so the limit is spent on movies and series', async () => {
    const user = await createUser();
    await watchSession({ userId: user.id, channelId: 'movie-1', contentType: 'movie' });
    tick();
    await watchSession({ userId: user.id, channelId: 'live-1', contentType: 'live' });
    tick();
    await watchSession({ userId: user.id, channelId: 'episode-1', contentType: 'series' });

    await expect(
      userRepository.getRecentlyWatched(user.id, PLAYLIST_ID, 20, { excludeLive: true }),
    ).resolves.toMatchObject([{ channelId: 'episode-1' }, { channelId: 'movie-1' }]);
    // The default keeps the old behaviour.
    const all = await userRepository.getRecentlyWatched(user.id, PLAYLIST_ID);
    expect(all.map((item) => item.channelId)).toContain('live-1');
  });
});

describe('getWatchStatsForChannels', () => {
  it('returns the most recently watched of the given channels', async () => {
    const user = await createUser();
    await watchSession({ userId: user.id, channelId: 's01e01', contentType: 'series' });
    tick();
    await watchSession({ userId: user.id, channelId: 's01e02', contentType: 'series', endPosition: 300, durationWatched: 300, totalDuration: 1000 });
    tick();
    await watchSession({ userId: user.id, channelId: 'unrelated-movie' });

    const stats = await userRepository.getWatchStatsForChannels(user.id, PLAYLIST_ID, [
      's01e01',
      's01e02',
      's01e03',
    ]);

    expect(stats).toMatchObject({ channelId: 's01e02', lastPosition: 300, totalDuration: 1000 });
  });

  it('returns null when none of the channels was ever watched', async () => {
    const user = await createUser();
    await watchSession({ userId: user.id, channelId: 'movie-1' });

    await expect(
      userRepository.getWatchStatsForChannels(user.id, PLAYLIST_ID, ['s01e01', 's01e02']),
    ).resolves.toBeNull();
    await expect(
      userRepository.getWatchStatsForChannels(user.id, PLAYLIST_ID, []),
    ).resolves.toBeNull();
  });

  it('finds a match past the chunking boundary', async () => {
    const user = await createUser();
    await watchSession({ userId: user.id, channelId: 'needle' });
    const channelIds = [
      ...Array.from({ length: 700 }, (_, i) => `filler-${i}`),
      'needle',
    ];

    const stats = await userRepository.getWatchStatsForChannels(
      user.id,
      PLAYLIST_ID,
      channelIds,
    );

    expect(stats?.channelId).toBe('needle');
  });

  it('scopes results to the requested user and playlist', async () => {
    const alice = await createUser('Alice');
    const bob = await createUser('Bob');
    await watchSession({ userId: bob.id, channelId: 'shared-episode' });
    await watchSession({ userId: alice.id, channelId: 'shared-episode', playlistId: 'other' });

    await expect(
      userRepository.getWatchStatsForChannels(alice.id, PLAYLIST_ID, ['shared-episode']),
    ).resolves.toBeNull();
  });
});

describe('getSavedPosition', () => {
  async function watchTo(userId: string, channelId: string, endPosition: number, totalDuration?: number) {
    await watchSession({ userId, channelId, endPosition, durationWatched: 60, totalDuration });
  }

  it('returns null when nothing has been watched', async () => {
    const user = await createUser();
    await expect(
      userRepository.getSavedPosition(user.id, PLAYLIST_ID, 'movie-1'),
    ).resolves.toBeNull();
  });

  it(`returns null below the ${RESUME_MIN_SECONDS}s resume floor`, async () => {
    const user = await createUser();
    await watchTo(user.id, 'movie-1', RESUME_MIN_SECONDS - 1, 1000);
    await expect(
      userRepository.getSavedPosition(user.id, PLAYLIST_ID, 'movie-1'),
    ).resolves.toBeNull();
  });

  it('returns the position from the resume floor up to 90% (exclusive)', async () => {
    const user = await createUser();
    await watchTo(user.id, 'at-floor', RESUME_MIN_SECONDS, 1000);
    await watchTo(user.id, 'midway', 500, 1000);

    await expect(
      userRepository.getSavedPosition(user.id, PLAYLIST_ID, 'at-floor'),
    ).resolves.toEqual({ lastPosition: RESUME_MIN_SECONDS, totalDuration: 1000 });
    await expect(
      userRepository.getSavedPosition(user.id, PLAYLIST_ID, 'midway'),
    ).resolves.toEqual({ lastPosition: 500, totalDuration: 1000 });
  });

  it(`returns null at or above ${COMPLETION_RATIO * 100}% of totalDuration`, async () => {
    const user = await createUser();
    // Derived from the shared constant, not a copy of it: the query inlines that
    // number as a literal (so the partial index can match), and a drift between
    // the two would silently change what counts as finished.
    const total = 1000;
    await watchTo(user.id, 'at-ratio', total * COMPLETION_RATIO, total);
    await watchTo(user.id, 'just-below', total * COMPLETION_RATIO - 1, total);

    await expect(
      userRepository.getSavedPosition(user.id, PLAYLIST_ID, 'at-ratio'),
    ).resolves.toBeNull();
    await expect(
      userRepository.getSavedPosition(user.id, PLAYLIST_ID, 'just-below'),
    ).resolves.toEqual({ lastPosition: total * COMPLETION_RATIO - 1, totalDuration: total });
  });

  it('resumes an unknown duration, which cannot be checked for completion', async () => {
    const user = await createUser();
    await watchTo(user.id, 'movie-1', 500);
    await expect(
      userRepository.getSavedPosition(user.id, PLAYLIST_ID, 'movie-1'),
    ).resolves.toEqual({ lastPosition: 500, totalDuration: undefined });
  });
});

describe('closeOrphanedSessions', () => {
  /** Sessions only count as orphaned once they are over an hour old. */
  const PAST_ORPHAN_AGE_MS = 3_600_000 + 60_000;

  it('ends open sessions, derives completion, and aggregates stats', async () => {
    const user = await createUser();

    const nearEnd = await userRepository.startViewingSession({
      userId: user.id,
      playlistId: PLAYLIST_ID,
      channelId: 'near-end',
      channelName: 'Near End',
      groupTitle: 'Movies',
      contentType: 'movie',
      totalDuration: 1000,
    });
    await userRepository.updateSessionProgress(nearEnd, 950, 600);

    const earlyExit = await userRepository.startViewingSession({
      userId: user.id,
      playlistId: PLAYLIST_ID,
      channelId: 'early-exit',
      channelName: 'Early Exit',
      contentType: 'movie',
      totalDuration: 1000,
    });
    await userRepository.updateSessionProgress(earlyExit, 200, 180);

    tick(PAST_ORPHAN_AGE_MS);
    await userRepository.closeOrphanedSessions();

    const sessions = await userRepository.getViewingHistory(user.id);
    const closedNearEnd = sessions.find((s) => s.id === nearEnd);
    const closedEarlyExit = sessions.find((s) => s.id === earlyExit);
    expect(closedNearEnd).toMatchObject({ endedAt: new Date(jest.now()).toISOString(), completed: true });
    expect(closedEarlyExit).toMatchObject({ endedAt: new Date(jest.now()).toISOString(), completed: false });

    const nearEndStats = await getChannelStatsRow(user.id, 'near-end');
    expect(nearEndStats).toMatchObject({
      watchCount: 1,
      totalTimeWatched: 600,
      lastPosition: 950,
      completionCount: 1,
    });
    const earlyExitStats = await getChannelStatsRow(user.id, 'early-exit');
    expect(earlyExitStats).toMatchObject({
      watchCount: 1,
      totalTimeWatched: 180,
      lastPosition: 200,
      completionCount: 0,
    });
  });

  it('does nothing when there are no open sessions', async () => {
    const user = await createUser();
    await watchSession({ userId: user.id, channelId: 'movie-1', durationWatched: 100 });

    await userRepository.closeOrphanedSessions();

    const stats = await getChannelStatsRow(user.id, 'movie-1');
    expect(stats?.watchCount).toBe(1);
  });

  it('leaves recent sessions alone — they are still playing, not orphaned', async () => {
    const user = await createUser();
    const sessionId = await userRepository.startViewingSession({
      userId: user.id,
      playlistId: PLAYLIST_ID,
      channelId: 'movie-1',
      channelName: 'Movie 1',
      contentType: 'movie',
      totalDuration: 1000,
    });
    tick(60_000);

    await userRepository.closeOrphanedSessions();

    const [session] = await userRepository.getViewingHistory(user.id);
    expect(session.id).toBe(sessionId);
    expect(session.endedAt).toBeUndefined();
    expect(await getChannelStatsRow(user.id, 'movie-1')).toBeNull();
  });

  it('never closes the caller\'s active session, however old', async () => {
    const user = await createUser();
    const activeSessionId = await userRepository.startViewingSession({
      userId: user.id,
      playlistId: PLAYLIST_ID,
      channelId: 'long-movie',
      channelName: 'Long Movie',
      contentType: 'movie',
      totalDuration: 20_000,
    });
    const crashed = await userRepository.startViewingSession({
      userId: user.id,
      playlistId: PLAYLIST_ID,
      channelId: 'crashed',
      channelName: 'Crashed',
      contentType: 'movie',
      totalDuration: 1000,
    });
    tick(PAST_ORPHAN_AGE_MS);

    await userRepository.closeOrphanedSessions(activeSessionId);

    const sessions = await userRepository.getViewingHistory(user.id);
    expect(sessions.find((s) => s.id === activeSessionId)?.endedAt).toBeUndefined();
    expect(sessions.find((s) => s.id === crashed)?.endedAt).toBe(
      new Date(jest.now()).toISOString(),
    );
    // Double-counting the active session in the stats is the bug this prevents.
    expect(await getChannelStatsRow(user.id, 'long-movie')).toBeNull();
    expect(await getChannelStatsRow(user.id, 'crashed')).not.toBeNull();
  });
});

describe('clearViewingHistory', () => {
  it('removes sessions and stats for the given user only', async () => {
    const alice = await createUser('Alice');
    const bob = await createUser('Bob');
    await watchSession({ userId: alice.id, channelId: 'movie-1', groupTitle: 'Movies', durationWatched: 100 });
    await watchSession({ userId: bob.id, channelId: 'movie-1', groupTitle: 'Movies', durationWatched: 100 });

    await userRepository.clearViewingHistory(alice.id);

    await expect(userRepository.getViewingHistory(alice.id)).resolves.toEqual([]);
    expect(await getChannelStatsRow(alice.id, 'movie-1')).toBeNull();
    expect(await getGroupStatsRow(alice.id, 'Movies')).toBeNull();

    expect(await userRepository.getViewingHistory(bob.id)).toHaveLength(1);
    expect(await getChannelStatsRow(bob.id, 'movie-1')).not.toBeNull();
    expect(await getGroupStatsRow(bob.id, 'Movies')).not.toBeNull();
  });
});

describe('setNextEpisode', () => {
  it('is returned by getRecentlyWatched', async () => {
    const user = await createUser();
    await watchSession({ userId: user.id, channelId: 's01e01', contentType: 'series' });

    await userRepository.setNextEpisode(
      user.id,
      PLAYLIST_ID,
      { channelId: 's01e01', channelName: 'Episode 1', contentType: 'series' },
      { channelId: 's01e02', channelName: 'Episode 2' },
    );

    const [item] = await userRepository.getRecentlyWatched(user.id, PLAYLIST_ID);
    expect(item.nextEpisodeChannelId).toBe('s01e02');
    expect(item.nextEpisodeChannelName).toBe('Episode 2');
  });

  it('creates the stats row on a first watch, before any session has closed', async () => {
    // The pointer is resolved at ~90%, while the episode is still playing: on a
    // first watch nothing has written `channel_watch_stats` yet, and an UPDATE
    // would silently store nothing.
    const user = await createUser();

    await userRepository.setNextEpisode(
      user.id,
      PLAYLIST_ID,
      {
        channelId: 's01e01',
        channelName: 'Episode 1',
        groupTitle: 'Series | Drama',
        contentType: 'series',
      },
      { channelId: 's01e02', channelName: 'Episode 2' },
    );

    const [item] = await userRepository.getRecentlyWatched(user.id, PLAYLIST_ID);
    expect(item).toMatchObject({
      channelId: 's01e01',
      channelName: 'Episode 1',
      nextEpisodeChannelId: 's01e02',
      nextEpisodeChannelName: 'Episode 2',
      // No watch has been recorded yet — the session that is running fills
      // these in when it closes.
      watchCount: 0,
    });
    expect(item.lastPosition).toBeUndefined();
  });

  it('counts the first completed watch of a pre-created row as a new channel in its group', async () => {
    const user = await createUser();
    await userRepository.setNextEpisode(
      user.id,
      PLAYLIST_ID,
      {
        channelId: 's01e01',
        channelName: 'Episode 1',
        groupTitle: 'Series | Drama',
        contentType: 'series',
      },
      { channelId: 's01e02', channelName: 'Episode 2' },
    );

    await watchSession({
      userId: user.id,
      channelId: 's01e01',
      channelName: 'Episode 1',
      groupTitle: 'Series | Drama',
      contentType: 'series',
    });

    // The row already existed, but nobody had watched the channel — the group's
    // unique-channel count must still move.
    const group = await getGroupStatsRow(user.id, 'Series | Drama');
    expect(group?.uniqueChannelsWatched).toBe(1);
  });

  it('survives the session that resolved it being closed', async () => {
    // The pointer is resolved mid-playback (~90% in), so ending the session
    // must not wipe it — the home rows read it right after.
    const user = await createUser();
    await watchSession({ userId: user.id, channelId: 's01e01', contentType: 'series' });
    await userRepository.setNextEpisode(
      user.id,
      PLAYLIST_ID,
      { channelId: 's01e01', channelName: 'Episode 1', contentType: 'series' },
      { channelId: 's01e02', channelName: 'Episode 2' },
    );

    tick();
    await watchSession({ userId: user.id, channelId: 's01e01', contentType: 'series' });

    const [item] = await userRepository.getRecentlyWatched(user.id, PLAYLIST_ID);
    expect(item.nextEpisodeChannelId).toBe('s01e02');
    expect(item.nextEpisodeChannelName).toBe('Episode 2');
  });
});

describe('getWatchedContent', () => {
  it('returns every watched channel id and the series names behind watched episodes', async () => {
    const user = await createUser();
    await watchSession({ userId: user.id, channelId: 'movie-1', channelName: 'Blade Runner' });
    await watchSession({
      userId: user.id,
      channelId: 'ep-1',
      channelName: 'Breaking Bad S01E01',
      contentType: 'series',
    });
    await watchSession({
      userId: user.id,
      channelId: 'ep-2',
      channelName: 'Breaking Bad S01E02',
      contentType: 'series',
    });

    const watched = await userRepository.getWatchedContent(user.id, PLAYLIST_ID);

    expect(watched.channelIds.sort()).toEqual(['ep-1', 'ep-2', 'movie-1']);
    // Episodes of one series collapse to a single series name.
    expect(watched.seriesNames).toEqual(['Breaking Bad']);
  });

  it('scopes results to the requested user and playlist', async () => {
    const user = await createUser();
    const other = await createUser('Bob');
    await watchSession({ userId: user.id, channelId: 'ch-a', playlistId: 'playlist-a' });
    await watchSession({ userId: user.id, channelId: 'ch-b', playlistId: 'playlist-b' });
    await watchSession({ userId: other.id, channelId: 'ch-c', playlistId: 'playlist-a' });

    const watched = await userRepository.getWatchedContent(user.id, 'playlist-a');
    expect(watched.channelIds).toEqual(['ch-a']);
  });

  it('is empty for a user who has watched nothing', async () => {
    const user = await createUser();
    await expect(userRepository.getWatchedContent(user.id, PLAYLIST_ID)).resolves.toEqual({
      channelIds: [],
      seriesNames: [],
      completedChannelIds: [],
      completedEpisodesBySeries: {},
    });
  });

  it('reports only the movies watched to completion', async () => {
    const user = await createUser();
    await watchSession({ userId: user.id, channelId: 'finished', completed: true });
    await watchSession({ userId: user.id, channelId: 'abandoned', completed: false });

    const watched = await userRepository.getWatchedContent(user.id, PLAYLIST_ID);

    expect(watched.completedChannelIds).toEqual(['finished']);
  });

  it('counts distinct completed episodes per series', async () => {
    const user = await createUser();
    const episode = (channelId: string, channelName: string, completed: boolean) =>
      watchSession({ userId: user.id, channelId, channelName, contentType: 'series', completed });

    await episode('a-1', 'Show A S01E01', true);
    await episode('a-2', 'Show A S01E02', true);
    await episode('a-3', 'Show A S01E03', false);
    await episode('b-1', 'Show B S01E01', true);
    // A rewatch is one more session on the same episode, not a second episode.
    await episode('b-1', 'Show B S01E01', true);

    const watched = await userRepository.getWatchedContent(user.id, PLAYLIST_ID);

    expect(watched.completedEpisodesBySeries).toEqual({ 'Show A': 2, 'Show B': 1 });
  });

  it('never counts live channels as completed content', async () => {
    const user = await createUser();
    await watchSession({
      userId: user.id,
      channelId: 'live-1',
      channelName: 'NRK1',
      contentType: 'live',
      completed: true,
    });

    const watched = await userRepository.getWatchedContent(user.id, PLAYLIST_ID);

    expect(watched.channelIds).toEqual(['live-1']);
    expect(watched.completedChannelIds).toEqual([]);
    expect(watched.completedEpisodesBySeries).toEqual({});
  });
});
