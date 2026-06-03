/* eslint-disable import/first */
import type {
  Channel as RustChannel,
  ChannelsWithCount as RustChannelsWithCount,
  SeriesListResult,
  PlaylistMetadata,
} from 'expo-m3u-parser';

// --- Mocks (jest.mock calls are hoisted above imports by Jest) ---
// mockDatabase must be declared before jest.mock to avoid TDZ issues.
// Using `var` so it hoists alongside the jest.mock factory.
/* eslint-disable no-var */
var mockDatabase: Record<string, jest.Mock>;
/* eslint-enable no-var */

jest.mock('expo-m3u-parser', () => {
  mockDatabase = {
    getChannels: jest.fn(),
    getChannelsWithCount: jest.fn(),
    getChannelById: jest.fn(),
    getSeriesList: jest.fn(),
    getSeriesEpisodes: jest.fn(),
    getPlaylist: jest.fn(),
    createPlaylist: jest.fn(),
    updatePlaylist: jest.fn(),
    fetchAndImportPlaylist: jest.fn(),
    deleteChannelsByPlaylist: jest.fn(),
    deletePlaylist: jest.fn(),
    countChannelsByPlaylist: jest.fn(),
    getGroupsByPlaylist: jest.fn(),
    getGroupsWithCountsByPlaylist: jest.fn(),
    getAllPlaylists: jest.fn(),
    getMetadataByStreamId: jest.fn(),
    getMetadataByChannelId: jest.fn(),
    getMetadataBySeriesName: jest.fn(),
  };
  return {
    Database: {
      open: jest.fn().mockResolvedValue(mockDatabase),
    },
  };
});

jest.mock('expo-file-system', () => ({
  Paths: { document: { uri: '/mock/path/' } },
}));

import { RustChannelService, getRustDatabase } from '../rust-channel-service';

beforeEach(() => {
  jest.clearAllMocks();
});

// Helper: minimal Rust channel
function makeRustChannel(overrides: Partial<RustChannel> = {}): RustChannel {
  return {
    channelId: 'ch-1',
    title: 'Test Channel',
    url: 'http://stream.test/1',
    group: 'Sports',
    duration: -1,
    contentType: 'live',
    isAdult: false,
    ...overrides,
  } as RustChannel;
}

describe('type conversion (rustChannelToJsChannel)', () => {
  it('maps title->name, tvgName->tvg.name, group->group.title', async () => {
    const rust = makeRustChannel({
      title: 'BBC One',
      tvgName: 'bbc1',
      group: 'UK Channels',
    });
    mockDatabase.getChannels.mockResolvedValue([rust]);

    const [channel] = await RustChannelService.getChannels();

    expect(channel.name).toBe('BBC One');
    expect(channel.tvg.name).toBe('bbc1');
    expect(channel.group.title).toBe('UK Channels');
  });

  it('converts empty optional fields to undefined', async () => {
    const rust = makeRustChannel();
    mockDatabase.getChannels.mockResolvedValue([rust]);

    const [channel] = await RustChannelService.getChannels();

    expect(channel.tvg.id).toBeUndefined();
    expect(channel.tvg.logo).toBeUndefined();
  });

  it('omits http object when neither userAgent nor referer set', async () => {
    const rust = makeRustChannel();
    mockDatabase.getChannels.mockResolvedValue([rust]);

    const [channel] = await RustChannelService.getChannels();

    expect(channel.http).toBeUndefined();
  });

  it('includes http object when userAgent is present', async () => {
    const rust = makeRustChannel({ userAgent: 'MyAgent/1.0' });
    mockDatabase.getChannels.mockResolvedValue([rust]);

    const [channel] = await RustChannelService.getChannels();

    expect(channel.http).toEqual({
      userAgent: 'MyAgent/1.0',
      referrer: undefined,
    });
  });

  it('includes http object when referer is present', async () => {
    const rust = makeRustChannel({ referer: 'http://ref.test' });
    mockDatabase.getChannels.mockResolvedValue([rust]);

    const [channel] = await RustChannelService.getChannels();

    expect(channel.http).toEqual({
      userAgent: undefined,
      referrer: 'http://ref.test',
    });
  });
});

describe('method delegation', () => {
  it('getChannelsFilteredWithCount forwards filter to db', async () => {
    const mockResult: RustChannelsWithCount = {
      channels: [makeRustChannel()],
      totalCount: 42,
    };
    mockDatabase.getChannelsWithCount.mockResolvedValue(mockResult);

    const result = await RustChannelService.getChannelsFilteredWithCount('p1', {
      search: 'test',
      limit: 10,
      offset: 5,
    });

    expect(mockDatabase.getChannelsWithCount).toHaveBeenCalledWith({
      playlistId: 'p1',
      search: 'test',
      limit: 10,
      offset: 5,
    });
    expect(result.totalCount).toBe(42);
    expect(result.channels).toHaveLength(1);
  });

  it('getSeriesList forwards filter to db', async () => {
    const mockResult: SeriesListResult = {
      series: [{ seriesName: 'Show', poster: undefined, groupName: 'G', episodeCount: 5 }],
      totalCount: 1,
    };
    mockDatabase.getSeriesList.mockResolvedValue(mockResult);

    const result = await RustChannelService.getSeriesList('p1', {
      search: 'Show',
      limit: 20,
    });

    expect(mockDatabase.getSeriesList).toHaveBeenCalledWith({
      playlistId: 'p1',
      search: 'Show',
      limit: 20,
    });
    expect(result.series[0].seriesName).toBe('Show');
  });

  it('getSeriesEpisodes forwards args to db', async () => {
    mockDatabase.getSeriesEpisodes.mockResolvedValue([makeRustChannel()]);

    const result = await RustChannelService.getSeriesEpisodes('p1', 'Breaking Bad', 'Drama');

    expect(mockDatabase.getSeriesEpisodes).toHaveBeenCalledWith('p1', 'Breaking Bad', 'Drama');
    expect(result).toHaveLength(1);
  });

  it('getChannelById returns converted channel or null', async () => {
    mockDatabase.getChannelById.mockResolvedValue(makeRustChannel({ title: 'Found' }));
    const found = await RustChannelService.getChannelById('p1', 'ch-1');
    expect(found?.name).toBe('Found');

    mockDatabase.getChannelById.mockResolvedValue(null);
    const notFound = await RustChannelService.getChannelById('p1', 'missing');
    expect(notFound).toBeNull();
  });

  it('getMetadataByChannelId forwards args to db', async () => {
    const meta = { playlistId: 'p1', channelId: 'ch-1', contentType: 'movie' as const };
    mockDatabase.getMetadataByChannelId.mockResolvedValue(meta);

    const result = await RustChannelService.getMetadataByChannelId('p1', 'ch-1');

    expect(mockDatabase.getMetadataByChannelId).toHaveBeenCalledWith('p1', 'ch-1');
    expect(result).toBe(meta);
  });
});

describe('fetchAndImportPlaylist', () => {
  it('creates a new playlist when none exists', async () => {
    mockDatabase.getPlaylist.mockResolvedValue(null);
    mockDatabase.createPlaylist.mockResolvedValue(undefined);
    mockDatabase.fetchAndImportPlaylist.mockResolvedValue(100);

    const count = await RustChannelService.fetchAndImportPlaylist(
      'p1',
      'My Playlist',
      'http://example.com/playlist.m3u',
    );

    expect(mockDatabase.createPlaylist).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'p1',
        name: 'My Playlist',
        url: 'http://example.com/playlist.m3u',
      }),
    );
    expect(mockDatabase.updatePlaylist).not.toHaveBeenCalled();
    expect(count).toBe(100);
  });

  it('updates existing playlist', async () => {
    mockDatabase.getPlaylist.mockResolvedValue({ id: 'p1' } as PlaylistMetadata);
    mockDatabase.updatePlaylist.mockResolvedValue(undefined);
    mockDatabase.fetchAndImportPlaylist.mockResolvedValue(50);

    await RustChannelService.fetchAndImportPlaylist(
      'p1',
      'Updated',
      'http://example.com/new.m3u',
    );

    expect(mockDatabase.updatePlaylist).toHaveBeenCalledWith('p1', {
      name: 'Updated',
      url: 'http://example.com/new.m3u',
      username: undefined,
      password: undefined,
    });
    expect(mockDatabase.createPlaylist).not.toHaveBeenCalled();
  });

  it('converts PlaylistCredentials to Credentials', async () => {
    mockDatabase.getPlaylist.mockResolvedValue(null);
    mockDatabase.createPlaylist.mockResolvedValue(undefined);
    mockDatabase.fetchAndImportPlaylist.mockResolvedValue(10);

    await RustChannelService.fetchAndImportPlaylist(
      'p1',
      'Auth',
      'http://example.com/auth.m3u',
      { username: 'user', password: 'pass' },
    );

    expect(mockDatabase.fetchAndImportPlaylist).toHaveBeenCalledWith(
      'p1',
      'http://example.com/auth.m3u',
      { username: 'user', password: 'pass' },
    );
  });
});

describe('singleton', () => {
  it('getRustDatabase returns the same instance on second call', async () => {
    const db1 = await getRustDatabase();
    const db2 = await getRustDatabase();
    expect(db1).toBe(db2);
  });
});
