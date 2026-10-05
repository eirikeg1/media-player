/**
 * Integration tests for the playlist import lifecycle.
 *
 * Create / refresh / delete flow through `RustChannelService` into the Rust
 * backend, which is faked by the in-memory m3u-database fake — remote content
 * is registered per URL and parsed with a real M3U parser.
 */
import { RustChannelService } from '../rust-channel-service';
import { __registerRemoteM3u } from '@/test/fakes/m3u-database-fake';
import { BASIC_M3U, BASIC_M3U_COUNTS } from '@/test/fixtures';
import { resetTestDatabases } from '@/test/helpers';

const PLAYLIST_URL = 'https://iptv.example.com/main.m3u';

beforeEach(async () => {
  await resetTestDatabases();
});

describe('playlist import lifecycle (through the Rust-backend fake)', () => {
  const UPDATED_M3U = `#EXTM3U
#EXTINF:-1 tvg-id="nrk1.no" group-title="Norway",NRK1 HD
http://stream.example.com/live/nrk1.m3u8
#EXTINF:-1 tvg-id="tv3.no" group-title="Norway",TV3 HD
http://stream.example.com/live/tv3.m3u8
`;

  it('imports all channels and records playlist metadata', async () => {
    __registerRemoteM3u(PLAYLIST_URL, BASIC_M3U);

    const count = await RustChannelService.fetchAndImportPlaylist('pl-1', 'Main', PLAYLIST_URL);

    expect(count).toBe(BASIC_M3U_COUNTS.total);
    expect(await RustChannelService.countChannelsByPlaylist('pl-1')).toBe(BASIC_M3U_COUNTS.total);

    const live = await RustChannelService.getChannelsFilteredWithCount('pl-1', { contentType: 'live' });
    expect(live.totalCount).toBe(BASIC_M3U_COUNTS.live);
    const movies = await RustChannelService.getChannelsFilteredWithCount('pl-1', { contentType: 'movie' });
    expect(movies.totalCount).toBe(BASIC_M3U_COUNTS.movies);
    const series = await RustChannelService.getChannelsFilteredWithCount('pl-1', { contentType: 'series' });
    expect(series.totalCount).toBe(BASIC_M3U_COUNTS.seriesEpisodes);

    const groups = await RustChannelService.getGroupsByPlaylist('pl-1');
    expect(groups).toEqual(
      expect.arrayContaining(['Norway', 'Sports', 'News', 'Movies | Sci-Fi', 'Series | Drama', 'Adult | XXX']),
    );

    const metadata = await RustChannelService.getPlaylistMetadata('pl-1');
    expect(metadata?.name).toBe('Main');
    expect(metadata?.channelCount).toBe(BASIC_M3U_COUNTS.total);
    expect(metadata?.lastFetchedAt).toBeDefined();
  });

  it('excludes adult entries when filtered', async () => {
    __registerRemoteM3u(PLAYLIST_URL, BASIC_M3U);
    await RustChannelService.fetchAndImportPlaylist('pl-1', 'Main', PLAYLIST_URL);

    const safeMovies = await RustChannelService.getChannelsFilteredWithCount('pl-1', {
      contentType: 'movie',
      excludeAdult: true,
    });

    expect(safeMovies.totalCount).toBe(BASIC_M3U_COUNTS.movies - BASIC_M3U_COUNTS.adult);
  });

  it('replaces channels on refresh instead of duplicating them', async () => {
    __registerRemoteM3u(PLAYLIST_URL, BASIC_M3U);
    await RustChannelService.fetchAndImportPlaylist('pl-1', 'Main', PLAYLIST_URL);

    const count = await RustChannelService.fetchAndImportPlaylist('pl-1', 'Main', PLAYLIST_URL);

    expect(count).toBe(BASIC_M3U_COUNTS.total);
    expect(await RustChannelService.countChannelsByPlaylist('pl-1')).toBe(BASIC_M3U_COUNTS.total);
  });

  it('picks up remote changes on refresh and drops stale channels', async () => {
    __registerRemoteM3u(PLAYLIST_URL, BASIC_M3U);
    await RustChannelService.fetchAndImportPlaylist('pl-1', 'Main', PLAYLIST_URL);

    // The provider's playlist shrank to two channels.
    __registerRemoteM3u(PLAYLIST_URL, UPDATED_M3U);
    const count = await RustChannelService.fetchAndImportPlaylist('pl-1', 'Main', PLAYLIST_URL);

    expect(count).toBe(2);
    expect(await RustChannelService.countChannelsByPlaylist('pl-1')).toBe(2);

    const stale = await RustChannelService.getChannelsFilteredWithCount('pl-1', { search: 'Sky Sports' });
    expect(stale.totalCount).toBe(0);
    const kept = await RustChannelService.getChannelsFilteredWithCount('pl-1', { search: 'TV3' });
    expect(kept.totalCount).toBe(1);

    const metadata = await RustChannelService.getPlaylistMetadata('pl-1');
    expect(metadata?.channelCount).toBe(2);
  });

  it('persists credentials on the playlist metadata', async () => {
    __registerRemoteM3u(PLAYLIST_URL, BASIC_M3U);

    await RustChannelService.fetchAndImportPlaylist('pl-1', 'Main', PLAYLIST_URL, {
      username: 'user-1',
      password: 'secret',
    });

    const metadata = await RustChannelService.getPlaylistMetadata('pl-1');
    expect(metadata?.username).toBe('user-1');
    expect(metadata?.password).toBe('secret');
  });

  it('updates name, URL, and credentials when re-importing an existing playlist', async () => {
    const newUrl = 'https://iptv.example.com/v2.m3u';
    __registerRemoteM3u(PLAYLIST_URL, BASIC_M3U);
    __registerRemoteM3u(newUrl, UPDATED_M3U);
    await RustChannelService.fetchAndImportPlaylist('pl-1', 'Main', PLAYLIST_URL);

    await RustChannelService.fetchAndImportPlaylist('pl-1', 'Renamed', newUrl, {
      username: 'new-user',
      password: 'new-pass',
    });

    const metadata = await RustChannelService.getPlaylistMetadata('pl-1');
    expect(metadata?.name).toBe('Renamed');
    expect(metadata?.url).toBe(newUrl);
    expect(metadata?.username).toBe('new-user');
    expect(metadata?.password).toBe('new-pass');
    expect(await RustChannelService.countChannelsByPlaylist('pl-1')).toBe(2);
  });

  it('removes the playlist and its channels on deletion', async () => {
    __registerRemoteM3u(PLAYLIST_URL, BASIC_M3U);
    await RustChannelService.fetchAndImportPlaylist('pl-1', 'Main', PLAYLIST_URL);

    await RustChannelService.deletePlaylist('pl-1');

    expect(await RustChannelService.getPlaylistMetadata('pl-1')).toBeNull();
    expect(await RustChannelService.countChannelsByPlaylist('pl-1')).toBe(0);
    expect(await RustChannelService.getAllPlaylistMetadata()).toHaveLength(0);
  });

  it('rejects when the URL has no registered fixture', async () => {
    await expect(
      RustChannelService.fetchAndImportPlaylist('pl-1', 'Main', 'https://iptv.example.com/missing.m3u'),
    ).rejects.toThrow(/No fixture registered/);
  });

  it('keeps the existing channels when a refresh fails to download', async () => {
    __registerRemoteM3u(PLAYLIST_URL, BASIC_M3U);
    await RustChannelService.fetchAndImportPlaylist('pl-1', 'Main', PLAYLIST_URL);

    await expect(
      RustChannelService.fetchAndImportPlaylist('pl-1', 'Main', 'https://iptv.example.com/dead.m3u'),
    ).rejects.toThrow(/No fixture registered/);

    expect(await RustChannelService.countChannelsByPlaylist('pl-1')).toBe(BASIC_M3U_COUNTS.total);
  });
});
