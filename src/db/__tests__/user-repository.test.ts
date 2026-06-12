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
import type { ContentType, User } from '@/types/user.types';
import { DEFAULT_USER_SETTINGS } from '@/types/user.types';
import { resetTestDatabases } from '@/test/helpers';

const BASE_TIME = new Date('2026-06-12T12:00:00.000Z');
const PLAYLIST_ID = 'playlist-1';

/** Advance the fake clock so the next write gets a later timestamp. */
function tick(ms = 1000): void {
  jest.setSystemTime(new Date(jest.now() + ms));
}

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

describe('hidden channels', () => {
  beforeEach(async () => {
    await seedChannels('ch-1');
  });

  it('round-trips hide/is/unhide with dedup', async () => {
    const user = await createUser();

    await userRepository.hideChannel(user.id, 'ch-1');
    await userRepository.hideChannel(user.id, 'ch-1');

    await expect(userRepository.isChannelHidden(user.id, 'ch-1')).resolves.toBe(true);
    await expect(userRepository.getHiddenChannels(user.id)).resolves.toEqual(['ch-1']);

    await userRepository.unhideChannel(user.id, 'ch-1');
    await expect(userRepository.isChannelHidden(user.id, 'ch-1')).resolves.toBe(false);
    await expect(userRepository.getHiddenChannels(user.id)).resolves.toEqual([]);
  });

  it('isolates hidden channels per user', async () => {
    const alice = await createUser('Alice');
    const bob = await createUser('Bob');

    await userRepository.hideChannel(alice.id, 'ch-1');

    await expect(userRepository.isChannelHidden(bob.id, 'ch-1')).resolves.toBe(false);
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

describe('channel order', () => {
  beforeEach(async () => {
    await seedChannels('ch-1', 'ch-2');
  });

  it('returns the order as a map', async () => {
    const user = await createUser();

    await userRepository.setChannelOrder(user.id, 'ch-1', 2);
    await userRepository.setChannelOrder(user.id, 'ch-2', 1);

    const order = await userRepository.getChannelOrder(user.id);
    expect(order.get('ch-1')).toBe(2);
    expect(order.get('ch-2')).toBe(1);
    expect(order.size).toBe(2);
  });

  it('upserts so the latest order wins without duplicating rows', async () => {
    const user = await createUser();

    await userRepository.setChannelOrder(user.id, 'ch-1', 5);
    await userRepository.setChannelOrder(user.id, 'ch-1', 9);

    const order = await userRepository.getChannelOrder(user.id);
    expect(order.get('ch-1')).toBe(9);

    const rows = await executeQuery(
      'SELECT * FROM user_channel_order WHERE userId = ? AND channelId = ?',
      [user.id, 'ch-1'],
    );
    expect(rows).toHaveLength(1);
  });

  it('clearChannelOrder only clears the given user', async () => {
    const alice = await createUser('Alice');
    const bob = await createUser('Bob');
    await userRepository.setChannelOrder(alice.id, 'ch-1', 1);
    await userRepository.setChannelOrder(bob.id, 'ch-1', 1);

    await userRepository.clearChannelOrder(alice.id);

    expect((await userRepository.getChannelOrder(alice.id)).size).toBe(0);
    expect((await userRepository.getChannelOrder(bob.id)).size).toBe(1);
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

  it('returns null below 10% of totalDuration', async () => {
    const user = await createUser();
    await watchTo(user.id, 'movie-1', 99, 1000);
    await expect(
      userRepository.getSavedPosition(user.id, PLAYLIST_ID, 'movie-1'),
    ).resolves.toBeNull();
  });

  it('returns the position between 10% (inclusive) and 90% (exclusive)', async () => {
    const user = await createUser();
    await watchTo(user.id, 'at-ten', 100, 1000);
    await watchTo(user.id, 'midway', 500, 1000);

    await expect(
      userRepository.getSavedPosition(user.id, PLAYLIST_ID, 'at-ten'),
    ).resolves.toEqual({ lastPosition: 100, totalDuration: 1000 });
    await expect(
      userRepository.getSavedPosition(user.id, PLAYLIST_ID, 'midway'),
    ).resolves.toEqual({ lastPosition: 500, totalDuration: 1000 });
  });

  it('returns null at or above 90% of totalDuration', async () => {
    const user = await createUser();
    await watchTo(user.id, 'movie-1', 900, 1000);
    await expect(
      userRepository.getSavedPosition(user.id, PLAYLIST_ID, 'movie-1'),
    ).resolves.toBeNull();
  });

  it('returns null when totalDuration is unknown', async () => {
    const user = await createUser();
    await watchTo(user.id, 'movie-1', 500);
    await expect(
      userRepository.getSavedPosition(user.id, PLAYLIST_ID, 'movie-1'),
    ).resolves.toBeNull();
  });
});

describe('closeOrphanedSessions', () => {
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

    tick(60_000);
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

describe('clearViewingHistoryForPlaylist', () => {
  it('removes history for the given playlist only', async () => {
    const user = await createUser();
    await watchSession({ userId: user.id, channelId: 'ch-a', playlistId: 'playlist-a', groupTitle: 'Movies', durationWatched: 100 });
    await watchSession({ userId: user.id, channelId: 'ch-b', playlistId: 'playlist-b', groupTitle: 'Movies', durationWatched: 100 });

    await userRepository.clearViewingHistoryForPlaylist(user.id, 'playlist-a');

    const sessions = await userRepository.getViewingHistory(user.id);
    expect(sessions.map((s) => s.playlistId)).toEqual(['playlist-b']);
    expect(await getChannelStatsRow(user.id, 'ch-a', 'playlist-a')).toBeNull();
    expect(await getChannelStatsRow(user.id, 'ch-b', 'playlist-b')).not.toBeNull();
    expect(await getGroupStatsRow(user.id, 'Movies', 'playlist-a')).toBeNull();
    expect(await getGroupStatsRow(user.id, 'Movies', 'playlist-b')).not.toBeNull();
  });
});

describe('setNextEpisode', () => {
  it('is returned by getRecentlyWatched', async () => {
    const user = await createUser();
    await watchSession({ userId: user.id, channelId: 's01e01', contentType: 'series' });

    await userRepository.setNextEpisode(user.id, PLAYLIST_ID, 's01e01', 's01e02', 'Episode 2');

    const [item] = await userRepository.getRecentlyWatched(user.id, PLAYLIST_ID);
    expect(item.nextEpisodeChannelId).toBe('s01e02');
    expect(item.nextEpisodeChannelName).toBe('Episode 2');
  });

  it('is cleared when the channel is watched again', async () => {
    const user = await createUser();
    await watchSession({ userId: user.id, channelId: 's01e01', contentType: 'series' });
    await userRepository.setNextEpisode(user.id, PLAYLIST_ID, 's01e01', 's01e02', 'Episode 2');

    tick();
    await watchSession({ userId: user.id, channelId: 's01e01', contentType: 'series' });

    const [item] = await userRepository.getRecentlyWatched(user.id, PLAYLIST_ID);
    expect(item.nextEpisodeChannelId).toBeUndefined();
    expect(item.nextEpisodeChannelName).toBeUndefined();
  });
});

describe('getMostWatchedGroups', () => {
  it('orders groups by totalTimeWatched descending', async () => {
    const user = await createUser();
    await watchSession({ userId: user.id, channelId: 'n-1', groupTitle: 'News', durationWatched: 100 });
    await watchSession({ userId: user.id, channelId: 'm-1', groupTitle: 'Movies', durationWatched: 900 });

    const groups = await userRepository.getMostWatchedGroups(user.id, PLAYLIST_ID);
    expect(groups.map((g) => g.groupTitle)).toEqual(['Movies', 'News']);
    expect(groups[0].totalTimeWatched).toBe(900);
  });
});

describe('migrateFavoritesToNewFormat', () => {
  it('rewrites legacy name-based favorites to tvg.id-based ids', async () => {
    const user = await createUser();
    const channel = {
      name: 'TV2 Sport',
      url: 'http://stream.example.com/tv2sport.m3u8',
      tvg: { id: 'tv2sport.no' },
    };
    await seedChannels('TV2 Sport', `${channel.name}|${channel.url}`, 'tv2sport.no');
    await userRepository.addFavoriteChannel(user.id, 'TV2 Sport');
    await userRepository.addFavoriteChannel(user.id, `${channel.name}|${channel.url}`);

    await userRepository.migrateFavoritesToNewFormat(user.id, [channel]);

    await expect(userRepository.getFavoriteChannels(user.id)).resolves.toEqual(['tv2sport.no']);
  });
});
