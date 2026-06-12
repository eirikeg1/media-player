/**
 * Integration tests for EpgService against the in-memory Rust-backend fake.
 *
 * Channels come from the BASIC_M3U fixture (NRK1/NRK2 carry
 * tvg-url="https://epg.example.com/guide.xml") and programmes from the
 * BASIC_XMLTV fixture (five programmes on 2026-06-12). Time-sensitive queries
 * pin the clock to EPG_FIXTURE_NOW (19:30 UTC) with fake timers.
 */
import { EpgService } from '../epg-service';
import { RustChannelService } from '../rust-channel-service';
import { __registerRemoteM3u, __registerRemoteXmltv } from '@/test/fakes/m3u-database-fake';
import { BASIC_M3U, BASIC_XMLTV, EPG_FIXTURE_NOW } from '@/test/fixtures';
import { resetTestDatabases } from '@/test/helpers';

const PLAYLIST_URL = 'https://iptv.example.com/main.m3u';
const GUIDE_URL = 'https://epg.example.com/guide.xml';
const PROGRAMME_COUNT = 5;

/** Unix seconds for a 2026-06-12 UTC time of day. */
const utc = (hour: number, minute = 0) => Date.UTC(2026, 5, 12, hour, minute, 0) / 1000;
const DAY_START = utc(0);
const DAY_END = DAY_START + 24 * 3600;

const NO_EPG_M3U = `#EXTM3U
#EXTINF:-1 tvg-id="local.test" group-title="Local",Local Channel
http://stream.example.com/live/local.m3u8
`;

async function importBasicPlaylist(id = 'pl-1'): Promise<string> {
  __registerRemoteM3u(PLAYLIST_URL, BASIC_M3U);
  await RustChannelService.fetchAndImportPlaylist(id, 'Main', PLAYLIST_URL);
  return id;
}

/** Import channels + guide, then run EPG detection — the standard happy path. */
async function importPlaylistWithGuide(id = 'pl-1'): Promise<string> {
  __registerRemoteXmltv(GUIDE_URL, BASIC_XMLTV);
  await importBasicPlaylist(id);
  await EpgService.detectAndFetchEpgSources(id);
  return id;
}

beforeEach(async () => {
  await resetTestDatabases();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('detectAndFetchEpgSources', () => {
  it('detects the guide URL from channel tvg-url fields and imports its programmes', async () => {
    __registerRemoteXmltv(GUIDE_URL, BASIC_XMLTV);
    await importBasicPlaylist();

    const sources = await EpgService.detectAndFetchEpgSources('pl-1');

    expect(sources).toHaveLength(1);
    expect(sources[0].url).toBe(GUIDE_URL);
    expect(sources[0].autoDetected).toBe(true);

    const [stored] = await EpgService.getEpgSourcesByPlaylist('pl-1');
    expect(stored.programmeCount).toBe(PROGRAMME_COUNT);
    expect(stored.lastFetchedAt).toBeDefined();

    const schedule = await EpgService.getChannelSchedule('tv2sport1.no', DAY_START, DAY_END);
    expect(schedule.map((p) => p.title)).toEqual([
      'Eliteserien: Rosenborg vs Brann',
      'Premier League Highlights',
    ]);
  });

  it('uses a user-provided EPG URL when the playlist has no tvg-url hints', async () => {
    const userEpgUrl = 'https://user.example.com/custom.xml';
    __registerRemoteM3u(PLAYLIST_URL, NO_EPG_M3U);
    __registerRemoteXmltv(userEpgUrl, BASIC_XMLTV);
    await RustChannelService.fetchAndImportPlaylist('pl-1', 'Main', PLAYLIST_URL);

    const sources = await EpgService.detectAndFetchEpgSources('pl-1', userEpgUrl);

    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      id: 'user-pl-1',
      url: userEpgUrl,
      name: 'User-configured XMLTV',
      autoDetected: false,
    });

    const [stored] = await EpgService.getEpgSourcesByPlaylist('pl-1');
    expect(stored.programmeCount).toBe(PROGRAMME_COUNT);
  });

  it('combines a user-provided EPG URL with auto-detected sources', async () => {
    const userEpgUrl = 'https://user.example.com/custom.xml';
    __registerRemoteXmltv(GUIDE_URL, BASIC_XMLTV);
    __registerRemoteXmltv(userEpgUrl, BASIC_XMLTV);
    await importBasicPlaylist();

    const sources = await EpgService.detectAndFetchEpgSources('pl-1', userEpgUrl);

    expect(sources.map((s) => s.url).sort()).toEqual([GUIDE_URL, userEpgUrl]);

    const stored = await EpgService.getEpgSourcesByPlaylist('pl-1');
    expect(stored).toHaveLength(2);
    for (const source of stored) {
      expect(source.programmeCount).toBe(PROGRAMME_COUNT);
    }
  });

  it('derives the XMLTV endpoint from an Xtream-style playlist URL as fallback', async () => {
    const xtreamPlaylistUrl = 'http://xtream.example.com/get.php?username=u1&password=p1&type=m3u_plus';
    const xtreamEpgUrl = 'http://xtream.example.com/xmltv.php?username=u1&password=p1';
    __registerRemoteM3u(xtreamPlaylistUrl, NO_EPG_M3U);
    __registerRemoteXmltv(xtreamEpgUrl, BASIC_XMLTV);
    await RustChannelService.fetchAndImportPlaylist('pl-x', 'Xtream', xtreamPlaylistUrl);

    const sources = await EpgService.detectAndFetchEpgSources('pl-x');

    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      id: 'xtream-pl-x',
      url: xtreamEpgUrl,
      name: 'Xtream XMLTV',
      autoDetected: true,
    });

    const [stored] = await EpgService.getEpgSourcesByPlaylist('pl-x');
    expect(stored.programmeCount).toBe(PROGRAMME_COUNT);
  });

  it('returns no sources for a playlist without EPG hints', async () => {
    __registerRemoteM3u(PLAYLIST_URL, NO_EPG_M3U);
    await RustChannelService.fetchAndImportPlaylist('pl-1', 'Main', PLAYLIST_URL);

    const sources = await EpgService.detectAndFetchEpgSources('pl-1');

    expect(sources).toEqual([]);
    expect(await EpgService.getEpgSourcesByPlaylist('pl-1')).toEqual([]);
  });

  it('survives a source whose guide cannot be downloaded', async () => {
    // tvg-url points at the guide, but no XMLTV fixture is registered.
    await importBasicPlaylist();

    const sources = await EpgService.detectAndFetchEpgSources('pl-1');

    expect(sources).toHaveLength(1);
    const [stored] = await EpgService.getEpgSourcesByPlaylist('pl-1');
    expect(stored.programmeCount).toBe(0);
    expect(await EpgService.getChannelSchedule('tv2sport1.no', DAY_START, DAY_END)).toEqual([]);
  });
});

describe('now/next queries at the fixture timestamp (19:30 UTC)', () => {
  beforeEach(async () => {
    await importPlaylistWithGuide();
    jest.useFakeTimers({ now: EPG_FIXTURE_NOW * 1000 });
  });

  it('returns the programme currently on air', async () => {
    const sport = await EpgService.getCurrentProgramme('tv2sport1.no');
    expect(sport?.title).toBe('Eliteserien: Rosenborg vs Brann');
    expect(sport?.category).toBe('Sports');

    const nrk1 = await EpgService.getCurrentProgramme('nrk1.no');
    expect(nrk1?.title).toBe('Nature Documentary');
  });

  it('returns null for a channel without guide data', async () => {
    expect(await EpgService.getCurrentProgramme('unknown.channel')).toBeNull();
  });

  it('returns the upcoming programme, or null when the schedule ends', async () => {
    const next = await EpgService.getNextProgramme('tv2sport1.no');
    expect(next?.title).toBe('Premier League Highlights');

    // Nature Documentary is the last NRK1 programme in the fixture.
    expect(await EpgService.getNextProgramme('nrk1.no')).toBeNull();
  });

  it('maps current programmes by channel id, skipping channels without data', async () => {
    const current = await EpgService.getCurrentProgrammesForChannels([
      'nrk1.no',
      'tv2sport1.no',
      'bbcone.uk',
      'missing.id',
    ]);

    expect(current.size).toBe(3);
    expect(current.get('nrk1.no')?.title).toBe('Nature Documentary');
    expect(current.get('tv2sport1.no')?.title).toBe('Eliteserien: Rosenborg vs Brann');
    expect(current.get('bbcone.uk')?.title).toBe('BBC News at Seven');
    expect(current.has('missing.id')).toBe(false);
  });

  it('returns an empty map for an empty channel list', async () => {
    const current = await EpgService.getCurrentProgrammesForChannels([]);
    expect(current.size).toBe(0);
  });
});

describe('schedules and search', () => {
  beforeEach(async () => {
    await importPlaylistWithGuide();
  });

  it('returns a channel schedule sorted by start time', async () => {
    const schedule = await EpgService.getChannelSchedule('nrk1.no', DAY_START, DAY_END);
    expect(schedule.map((p) => p.title)).toEqual(['Dagsrevyen', 'Nature Documentary']);
  });

  it('only includes programmes overlapping the window', async () => {
    // Dagsrevyen ends at 19:00, so a 19:30–20:00 window excludes it.
    const schedule = await EpgService.getChannelSchedule('nrk1.no', utc(19, 30), utc(20));
    expect(schedule.map((p) => p.title)).toEqual(['Nature Documentary']);
  });

  it('groups guide-grid programmes by channel, omitting channels without data', async () => {
    const grid = await EpgService.getProgrammesForChannels(
      ['nrk1.no', 'tv2sport1.no', 'missing.id'],
      DAY_START,
      DAY_END,
    );

    expect([...grid.keys()].sort()).toEqual(['nrk1.no', 'tv2sport1.no']);
    expect(grid.get('tv2sport1.no')?.map((p) => p.title)).toEqual([
      'Eliteserien: Rosenborg vs Brann',
      'Premier League Highlights',
    ]);
  });

  it('returns an empty map for an empty channel list', async () => {
    const grid = await EpgService.getProgrammesForChannels([], DAY_START, DAY_END);
    expect(grid.size).toBe(0);
  });

  it('searches programme titles case-insensitively', async () => {
    const result = await EpgService.searchProgrammes('ELITESERIEN');

    expect(result.hasMore).toBe(false);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].channelId).toBe('tv2sport1.no');
    expect(result.groups[0].programmes.map((p) => p.title)).toEqual([
      'Eliteserien: Rosenborg vs Brann',
    ]);
  });

  it('filters search results by category', async () => {
    const result = await EpgService.searchProgrammes('', { category: 'Sports' });

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].channelId).toBe('tv2sport1.no');
    expect(result.groups[0].programmes).toHaveLength(2);
  });

  it('filters search results by time window', async () => {
    const result = await EpgService.searchProgrammes('', { from: utc(20, 30), to: utc(22) });

    const titles = result.groups.flatMap((g) => g.programmes.map((p) => p.title));
    expect(titles).toEqual(['Premier League Highlights']);
  });

  it('paginates search results and reports hasMore', async () => {
    const firstPage = await EpgService.searchProgrammes('', { limit: 2 });
    expect(firstPage.groups.flatMap((g) => g.programmes)).toHaveLength(2);
    expect(firstPage.hasMore).toBe(true);

    const lastPage = await EpgService.searchProgrammes('', { limit: 2, offset: 4 });
    expect(lastPage.groups.flatMap((g) => g.programmes)).toHaveLength(1);
    expect(lastPage.hasMore).toBe(false);
  });
});

describe('cleanupExpired', () => {
  beforeEach(async () => {
    await importPlaylistWithGuide();
  });

  it('deletes programmes that ended before the cutoff', async () => {
    // Two days after the fixture, every programme ended more than 24h ago.
    jest.useFakeTimers({ now: (EPG_FIXTURE_NOW + 48 * 3600) * 1000 });

    const removed = await EpgService.cleanupExpired(24);

    expect(removed).toBe(PROGRAMME_COUNT);
    expect(await EpgService.getChannelSchedule('tv2sport1.no', DAY_START, DAY_END)).toEqual([]);
  });

  it('keeps programmes that are airing or recently ended', async () => {
    jest.useFakeTimers({ now: EPG_FIXTURE_NOW * 1000 });

    const removed = await EpgService.cleanupExpired(24);

    expect(removed).toBe(0);
    const schedule = await EpgService.getChannelSchedule('nrk1.no', DAY_START, DAY_END);
    expect(schedule).toHaveLength(2);
  });
});
