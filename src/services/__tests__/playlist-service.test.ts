/**
 * Integration tests for the playlist service layer.
 *
 * `PlaylistService` is the HTTP fetch/validation wrapper, exercised against a
 * stubbed global `fetch` (the network boundary). The actual import lifecycle
 * (create / refresh / delete) flows through `RustChannelService` into the
 * Rust backend, which is faked by the in-memory m3u-database fake — remote
 * content is registered per URL and parsed with a real M3U parser.
 */
import { PlaylistService } from '../playlist-service';
import { RustChannelService } from '../rust-channel-service';
import { __registerRemoteM3u } from '@/test/fakes/m3u-database-fake';
import { BASIC_M3U, BASIC_M3U_COUNTS } from '@/test/fixtures';
import { resetTestDatabases } from '@/test/helpers';

const PLAYLIST_URL = 'https://iptv.example.com/main.m3u';

beforeEach(async () => {
  await resetTestDatabases();
});

describe('PlaylistService.validateUrl', () => {
  it('accepts http and https URLs', () => {
    expect(PlaylistService.validateUrl('http://example.com/playlist.m3u')).toBe(true);
    expect(PlaylistService.validateUrl('https://example.com/playlist.m3u?user=a&pass=b')).toBe(true);
  });

  it('rejects non-http protocols, garbage, and empty input', () => {
    expect(PlaylistService.validateUrl('ftp://example.com/playlist.m3u')).toBe(false);
    expect(PlaylistService.validateUrl('not a url')).toBe(false);
    expect(PlaylistService.validateUrl('')).toBe(false);
  });
});

describe('PlaylistService.fetchPlaylistContent', () => {
  const mockFetch = jest.fn();
  let originalFetch: typeof fetch | undefined;

  beforeAll(() => {
    originalFetch = global.fetch;
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch as typeof fetch;
  });

  function httpResponse(body: string, status = 200, statusText = '') {
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText,
      text: () => Promise.resolve(body),
    };
  }

  it('returns the playlist content on success', async () => {
    mockFetch.mockResolvedValue(httpResponse(BASIC_M3U));

    const content = await PlaylistService.fetchPlaylistContent(PLAYLIST_URL);

    expect(content).toBe(BASIC_M3U);
    expect(mockFetch).toHaveBeenCalledWith(PLAYLIST_URL, expect.objectContaining({ method: 'GET' }));
  });

  it('embeds credentials into the URL as HTTP basic auth', async () => {
    mockFetch.mockResolvedValue(httpResponse(BASIC_M3U));

    await PlaylistService.fetchPlaylistContent('https://example.com/playlist.m3u', {
      username: 'user',
      password: 'p@ss',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://user:p%40ss@example.com/playlist.m3u',
      expect.anything(),
    );
  });

  it('fetches the URL untouched when no credentials are given', async () => {
    const url = 'https://example.com/get.php?username=a&password=b&type=m3u_plus';
    mockFetch.mockResolvedValue(httpResponse(BASIC_M3U));

    await PlaylistService.fetchPlaylistContent(url);

    expect(mockFetch).toHaveBeenCalledWith(url, expect.anything());
  });

  it('rejects an invalid URL before hitting the network', async () => {
    await expect(PlaylistService.fetchPlaylistContent('ftp://example.com/list.m3u')).rejects.toThrow(
      'Invalid URL format. Please provide a valid HTTP or HTTPS URL.',
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it.each([401, 403])('maps HTTP %i to an authentication error', async (status) => {
    mockFetch.mockResolvedValue(httpResponse('', status));

    await expect(PlaylistService.fetchPlaylistContent(PLAYLIST_URL)).rejects.toThrow(
      'Authentication failed. Please check your credentials or URL.',
    );
  });

  it('maps HTTP 404 to a not-found error', async () => {
    mockFetch.mockResolvedValue(httpResponse('', 404));

    await expect(PlaylistService.fetchPlaylistContent(PLAYLIST_URL)).rejects.toThrow(
      'Playlist not found. Please verify the URL.',
    );
  });

  it('maps HTTP 5xx to a server error', async () => {
    mockFetch.mockResolvedValue(httpResponse('', 503));

    await expect(PlaylistService.fetchPlaylistContent(PLAYLIST_URL)).rejects.toThrow(
      'Server error. Please try again later.',
    );
  });

  it('surfaces other HTTP errors with status and text', async () => {
    mockFetch.mockResolvedValue(httpResponse('', 418, "I'm a teapot"));

    await expect(PlaylistService.fetchPlaylistContent(PLAYLIST_URL)).rejects.toThrow(
      "HTTP 418: I'm a teapot",
    );
  });

  it('rejects an empty or whitespace-only body', async () => {
    mockFetch.mockResolvedValue(httpResponse('   \n  '));

    await expect(PlaylistService.fetchPlaylistContent(PLAYLIST_URL)).rejects.toThrow(
      'Playlist content is empty',
    );
  });

  it('maps a fetch TypeError to a network error', async () => {
    mockFetch.mockRejectedValue(new TypeError('Network request failed'));

    await expect(PlaylistService.fetchPlaylistContent(PLAYLIST_URL)).rejects.toThrow(
      'Network error. Please check your internet connection.',
    );
  });

  it('maps non-Error rejections to a generic error', async () => {
    mockFetch.mockRejectedValue('boom');

    await expect(PlaylistService.fetchPlaylistContent(PLAYLIST_URL)).rejects.toThrow(
      'Unknown error occurred while fetching playlist',
    );
  });
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
