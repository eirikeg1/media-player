/**
 * The one-time remap of legacy `"{title}|{url}"` channel ids onto the stable
 * ids the backend generates today.
 *
 * Runs against real SQLite (the expo-sqlite fake) and the in-memory backend
 * fake, which implements the same id rule as Rust, so the rows these tests seed
 * go through the actual migration SQL.
 */
import { migrateLegacyChannelIds } from '@/db/migrations';
import { executeQuery, executeStatement } from '@/db/sqlite-client';
import { userRepository } from '@/db/user-repository';
import { RustChannelService, getRustDatabase } from '@/services/rust-channel-service';
import { makeRustChannel } from '@/test/factories';
import { Database as M3uDatabaseFake } from '@/test/fakes/m3u-database-fake';
import { resetTestDatabases } from '@/test/helpers';
import type { User } from '@/types/user.types';

type FakeDb = InstanceType<typeof M3uDatabaseFake>;

const PLAYLIST_ID = 'pl-1';
const MOVIE_URL = 'http://host:8080/movie/u/p/12345.mp4';
const EPISODE_URL = 'http://host:8080/series/u/p/678.mkv';
/** A plain-M3U entry: no stream id, so its id has nowhere to move to. */
const PLAIN_URL = 'http://host:8080/stream.m3u8';

const LEGACY_MOVIE_ID = `Wedding Crashers - 2005|${MOVIE_URL}`;
const LEGACY_EPISODE_ID = `Breaking Bad S01E01|${EPISODE_URL}`;
const LEGACY_PLAIN_ID = `Local Channel|${PLAIN_URL}`;

let db: FakeDb;
let user: User;

/** The catalogue as it was imported under the old rule. */
function seedLegacyCatalogue(): void {
  db.__seedChannels(PLAYLIST_ID, [
    makeRustChannel({
      title: 'Wedding Crashers - 2005',
      url: MOVIE_URL,
      tvgId: undefined,
      contentType: 'movie',
      channelId: LEGACY_MOVIE_ID,
    }),
    makeRustChannel({
      title: 'Breaking Bad S01E01',
      url: EPISODE_URL,
      tvgId: undefined,
      contentType: 'series',
      channelId: LEGACY_EPISODE_ID,
    }),
    makeRustChannel({
      title: 'Local Channel',
      url: PLAIN_URL,
      tvgId: undefined,
      contentType: 'live',
      channelId: LEGACY_PLAIN_ID,
    }),
  ]);
}

async function seedPlaylistRow(): Promise<void> {
  const now = new Date().toISOString();
  await executeStatement(
    'INSERT OR IGNORE INTO playlists (id, name, url, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)',
    [PLAYLIST_ID, 'Seed Playlist', 'https://iptv.example.com/seed.m3u', now, now],
  );
}

/** A finished watch, as the history records one. */
async function watch(
  channelId: string,
  channelName: string,
  contentType: 'movie' | 'series' | 'live',
  endPosition = 600,
): Promise<void> {
  const sessionId = await userRepository.startViewingSession({
    userId: user.id,
    playlistId: PLAYLIST_ID,
    channelId,
    channelName,
    contentType,
    totalDuration: 5400,
  });
  await userRepository.endViewingSession(sessionId, endPosition, endPosition, false);
}

async function channelIdsIn(table: string, column = 'channelId'): Promise<string[]> {
  const rows = await executeQuery<{ id: string }>(`SELECT ${column} AS id FROM ${table}`);
  return rows.map((row) => row.id).sort();
}

beforeEach(async () => {
  await resetTestDatabases();
  db = (await getRustDatabase()) as unknown as FakeDb;
  await seedPlaylistRow();
  user = await userRepository.createUser({ username: 'Alice' });
});

describe('migrateLegacyChannelIds', () => {
  beforeEach(seedLegacyCatalogue);

  it('remaps history, favourites, reactions and the catalogue itself', async () => {
    await watch(LEGACY_MOVIE_ID, 'Wedding Crashers - 2005', 'movie');
    await watch(LEGACY_PLAIN_ID, 'Local Channel', 'live');
    await userRepository.addFavoriteChannel(user.id, LEGACY_EPISODE_ID);
    await userRepository.setContentReaction(user.id, LEGACY_MOVIE_ID, 1);
    await executeStatement(
      'INSERT INTO user_hidden_channels (id, userId, channelId, hiddenAt) VALUES (?, ?, ?, ?)',
      ['hidden-1', user.id, LEGACY_EPISODE_ID, new Date().toISOString()],
    );
    await executeStatement(
      'INSERT INTO user_channel_order (id, userId, channelId, sortOrder) VALUES (?, ?, ?, ?)',
      ['order-1', user.id, LEGACY_EPISODE_ID, 1],
    );

    await migrateLegacyChannelIds();

    // Every table keyed by a channel id follows the catalogue, and the
    // plain-M3U row — nothing to map it to — stays exactly as it was.
    expect(await channelIdsIn('channel_watch_stats')).toEqual(
      [LEGACY_PLAIN_ID, 'movie:12345'].sort(),
    );
    expect(await channelIdsIn('viewing_sessions')).toEqual([LEGACY_PLAIN_ID, 'movie:12345'].sort());
    expect(await userRepository.getFavoriteChannels(user.id)).toEqual(['episode:678']);
    expect(await userRepository.getContentReactions(user.id)).toEqual([
      expect.objectContaining({ channelId: 'movie:12345', reaction: 1 }),
    ]);
    expect(await channelIdsIn('user_hidden_channels')).toEqual(['episode:678']);
    expect(await channelIdsIn('user_channel_order')).toEqual(['episode:678']);

    // …and the catalogue is on the new ids without waiting for a refresh.
    expect(await RustChannelService.getChannelById(PLAYLIST_ID, 'movie:12345')).not.toBeNull();
  });

  it('leaves ids it cannot map alone', async () => {
    await watch(LEGACY_PLAIN_ID, 'Local Channel', 'live');
    await userRepository.addFavoriteChannel(user.id, 'bbc.one.uk');
    await userRepository.addFavoriteChannel(user.id, 'series:Breaking Bad');

    await migrateLegacyChannelIds();

    expect(await channelIdsIn('channel_watch_stats')).toEqual([LEGACY_PLAIN_ID]);
    expect((await userRepository.getFavoriteChannels(user.id)).sort()).toEqual([
      'bbc.one.uk',
      'series:Breaking Bad',
    ]);
  });

  it('follows the next-episode pointer as well', async () => {
    await watch(LEGACY_EPISODE_ID, 'Breaking Bad S01E01', 'series');
    await userRepository.setNextEpisode(
      user.id,
      PLAYLIST_ID,
      {
        channelId: LEGACY_EPISODE_ID,
        channelName: 'Breaking Bad S01E01',
        contentType: 'series',
      },
      { channelId: LEGACY_MOVIE_ID, channelName: 'Breaking Bad S01E02' },
    );

    await migrateLegacyChannelIds();

    expect(await channelIdsIn('channel_watch_stats', 'nextEpisodeChannelId')).toEqual([
      'movie:12345',
    ]);
  });

  it('collapses the rows a rename had split, keeping the most recent watch', async () => {
    // The same movie under both spellings: the rename produced a second row,
    // which is exactly the damage this migration undoes.
    await watch(LEGACY_MOVIE_ID, 'Wedding Crashers - 2005', 'movie', 300);
    await watch(`Wedding Crashers [PRE] [2005]|${MOVIE_URL}`, 'Wedding Crashers', 'movie', 1800);

    await migrateLegacyChannelIds();

    const stats = await executeQuery<{ channelId: string; lastPosition: number }>(
      'SELECT channelId, lastPosition FROM channel_watch_stats',
    );
    expect(stats).toEqual([{ channelId: 'movie:12345', lastPosition: 1800 }]);
  });

  it('records itself and does nothing on a second run', async () => {
    await watch(LEGACY_MOVIE_ID, 'Wedding Crashers - 2005', 'movie');

    await migrateLegacyChannelIds();
    const rewrite = jest.spyOn(db, 'rewritePlaylistChannelIds');
    await migrateLegacyChannelIds();

    expect(rewrite).not.toHaveBeenCalled();
    const applied = await executeQuery<{ name: string }>(
      'SELECT name FROM migrations WHERE version = 22',
    );
    expect(applied).toEqual([{ name: 'remap_legacy_channel_ids' }]);
  });

  it('is recorded even when there is nothing to migrate', async () => {
    await executeStatement('DELETE FROM playlists');

    await migrateLegacyChannelIds();

    expect(await executeQuery('SELECT version FROM migrations WHERE version = 22')).toHaveLength(1);
  });
});

describe('continue watching after a rename', () => {
  it('resolves a history row whose title the panel has rewritten', async () => {
    // History keyed on the stable id, from before the rename…
    await watch('movie:12345', 'Wedding Crashers - 2005', 'movie', 1800);

    // …and a catalogue re-imported with the panel's new title for it.
    db.__seedChannels(PLAYLIST_ID, [
      makeRustChannel({
        title: 'Wedding Crashers [PRE] [2005]',
        url: MOVIE_URL,
        tvgId: undefined,
        contentType: 'movie',
      }),
    ]);

    const [item] = await userRepository.getContinueWatching(user.id, PLAYLIST_ID);
    expect(item.channelId).toBe('movie:12345');

    const channel = await RustChannelService.getChannelById(PLAYLIST_ID, item.channelId);
    expect(channel?.name).toBe('Wedding Crashers [PRE] [2005]');
  });
});
