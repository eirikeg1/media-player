/**
 * Sanity checks for the test infrastructure itself: automatic native-boundary
 * mocks, the real-SQLite expo-sqlite fake, migrations, and the M3U/EPG
 * fixture pipeline through the Rust-backend fake.
 */
import { Database } from 'expo-m3u-parser';
import { executeQuery, executeStatement, getDatabase } from '@/db/sqlite-client';
import {
  __registerRemoteM3u,
  __registerRemoteXmltv,
} from '@/test/fakes/m3u-database-fake';
import { makePlaylistMetadata } from '@/test/factories';
import { BASIC_M3U, BASIC_M3U_COUNTS, BASIC_XMLTV, EPG_FIXTURE_NOW } from '@/test/fixtures';
import { resetTestDatabases } from '@/test/helpers';

beforeEach(async () => {
  await resetTestDatabases();
});

describe('expo-sqlite fake (real SQLite via better-sqlite3)', () => {
  it('executes real SQL through sqlite-client', async () => {
    await executeStatement('CREATE TABLE smoke (id INTEGER PRIMARY KEY, name TEXT)');
    await executeStatement('INSERT INTO smoke (name) VALUES (?)', ['hello']);
    const rows = await executeQuery<{ id: number; name: string }>('SELECT * FROM smoke');
    expect(rows).toEqual([{ id: 1, name: 'hello' }]);
  });

  it('applies all migrations on a fresh database', async () => {
    const db = await getDatabase();
    const tables = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    );
    const names = tables.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining(['users', 'user_settings', 'playlists', 'viewing_sessions']),
    );
  });

  it('isolates state between tests (fresh database each time)', async () => {
    const rows = await executeQuery(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'smoke'",
    );
    expect(rows).toHaveLength(0);
  });
});

describe('expo-m3u-parser fake (Rust backend)', () => {
  it('imports the M3U fixture through the fetch-and-import path', async () => {
    const db = await Database.open('/test/channels.db');
    const playlist = makePlaylistMetadata({ id: 'pl-1' });
    await db.createPlaylist(playlist);
    __registerRemoteM3u(playlist.url, BASIC_M3U);

    const imported = await db.fetchAndImportPlaylist('pl-1', playlist.url);

    expect(imported).toBe(BASIC_M3U_COUNTS.total);
    expect(await db.countChannelsByPlaylist('pl-1')).toBe(BASIC_M3U_COUNTS.total);

    const { channels, totalCount } = await db.getChannelsWithCount({
      playlistId: 'pl-1',
      contentType: 'live',
    });
    expect(totalCount).toBe(BASIC_M3U_COUNTS.live);
    expect(channels.map((c) => c.title)).toContain('TV2 Sport 1 HD');

    const groups = await db.getGroupsByPlaylist('pl-1');
    expect(groups).toEqual(
      expect.arrayContaining(['Norway', 'Sports', 'News', 'Series | Drama']),
    );

    const { series } = await db.getSeriesList({ playlistId: 'pl-1' });
    expect(series.map((s) => s.seriesName)).toEqual(['Breaking Bad', 'The Wire']);
    expect(series[0].episodeCount).toBe(3);
  });

  it('imports the XMLTV fixture and answers now/next queries', async () => {
    const db = await Database.open('/test/channels.db');
    await db.upsertEpgSource({
      id: 'src-1',
      url: 'https://epg.example.com/guide.xml',
      autoDetected: false,
      programmeCount: 0,
      playlistId: 'pl-1',
    });
    __registerRemoteXmltv('https://epg.example.com/guide.xml', BASIC_XMLTV);

    const count = await db.fetchAndImportEpg('src-1', 'https://epg.example.com/guide.xml');
    expect(count).toBe(5);

    const current = await db.getCurrentProgramme('tv2sport1.no', EPG_FIXTURE_NOW);
    expect(current?.title).toBe('Eliteserien: Rosenborg vs Brann');

    const next = await db.getNextProgramme('tv2sport1.no', EPG_FIXTURE_NOW);
    expect(next?.title).toBe('Premier League Highlights');
  });
});
