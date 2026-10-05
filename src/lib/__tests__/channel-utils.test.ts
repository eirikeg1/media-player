import {
  getChannelId,
  getRawChannelId,
  getSeriesId,
  isChannelFavorite,
} from '../channel-utils';
import type { Channel } from '@/types/playlist.types';

function makeChannel(name: string, url: string, tvgId?: string): Channel {
  return { name, url, tvg: tvgId === undefined ? {} : { id: tvgId }, group: {} };
}

/**
 * The id rule, case for case as `channel_id_generation::id_rule_table` in
 * `native/rust-backend/crates/m3u-types/src/lib.rs` asserts it.
 *
 * The app derives ids for channels it holds in memory while the catalogue rows
 * carry ids generated in Rust; the two have to agree exactly, or everything
 * keyed on a channel id (history, continue-watching, favourites, reactions)
 * points at nothing. Change one table, change the other.
 */
const ID_RULE_TABLE: [tvgId: string | undefined, name: string, url: string, expected: string][] = [
  // tvg_id wins over everything, including a stream URL.
  ['bbc.one.uk', 'BBC One', 'http://host:8080/live/user/pass/42.ts', 'bbc.one.uk'],
  ['  spaced  ', 'Spaced', 'http://host/x', 'spaced'],
  // Xtream URLs: kind from the path, id from the last segment.
  [
    undefined,
    'Wedding Crashers - 2005',
    'http://host:8080/movie/user/pass/12345.mp4',
    'movie:12345',
  ],
  [
    undefined,
    'Wedding Crashers [PRE] [2005]',
    'http://host:8080/movie/user/pass/12345.mkv',
    'movie:12345',
  ],
  [undefined, 'Breaking Bad S01E01', 'http://host:8080/series/user/pass/678.mp4', 'episode:678'],
  [undefined, 'Sky Sports', 'http://host:8080/live/user/pass/42.ts', 'live:42'],
  // No extension, and a query string on either shape.
  [undefined, 'Sky Sports', 'http://host:8080/live/user/pass/42', 'live:42'],
  [undefined, 'Sky Sports', 'http://host:8080/live/user/pass/42?token=abc', 'live:42'],
  [undefined, 'Movie', 'http://host:8080/movie/user/pass/12345.mp4?token=abc', 'movie:12345'],
  // Plain M3U: no kind segment, or no numeric stream id.
  [
    undefined,
    'Local File',
    'http://example.com/stream.m3u8',
    'Local File|http://example.com/stream.m3u8',
  ],
  [
    undefined,
    'Named',
    'http://host:8080/movie/user/pass/named.mp4',
    'Named|http://host:8080/movie/user/pass/named.mp4',
  ],
  [
    undefined,
    'No Kind',
    'http://host:8080/user/pass/12345.mp4',
    'No Kind|http://host:8080/user/pass/12345.mp4',
  ],
];

describe('getChannelId', () => {
  it.each(ID_RULE_TABLE)('tvg %p, %p @ %p → %p', (tvgId, name, url, expected) => {
    expect(getChannelId(makeChannel(name, url, tvgId))).toBe(expected);
  });

  it('is stable when the panel rewrites a movie title', () => {
    const before = makeChannel('Wedding Crashers - 2005', 'http://h:8080/movie/u/p/12345.mp4');
    const after = makeChannel('Wedding Crashers [PRE] [2005]', 'http://h:8080/movie/u/p/12345.mp4');

    expect(getChannelId(after)).toBe(getChannelId(before));
  });

  it('keeps a movie and a series apart when a panel reuses a stream id', () => {
    const movie = makeChannel('Movie', 'http://h:8080/movie/u/p/7.mp4');
    const episode = makeChannel('Episode', 'http://h:8080/series/u/p/7.mp4');

    expect(getChannelId(movie)).not.toBe(getChannelId(episode));
  });

  it('never consults the host for the kind', () => {
    const channel = makeChannel('Movie', 'http://movie.example.com/123.mp4');

    expect(getChannelId(channel)).toBe('Movie|http://movie.example.com/123.mp4');
  });
});

describe('getRawChannelId', () => {
  it.each(ID_RULE_TABLE)('tvg %p, %p @ %p → %p', (tvgId, name, url, expected) => {
    expect(getRawChannelId({ name, url, tvg: { id: tvgId } })).toBe(expected);
  });

  it('accepts the flattened tvgId parsed items carry', () => {
    expect(getRawChannelId({ name: 'BBC One', url: 'http://h/1', tvgId: 'bbc.one' })).toBe(
      'bbc.one',
    );
  });
});

describe('isChannelFavorite', () => {
  const channel = makeChannel('Wedding Crashers', 'http://h:8080/movie/u/p/12345.mp4');

  it('matches the current id', () => {
    expect(isChannelFavorite(channel, ['movie:12345'])).toBe(true);
  });

  it('still matches favourites saved under the legacy forms', () => {
    expect(isChannelFavorite(channel, ['Wedding Crashers|http://h:8080/movie/u/p/12345.mp4'])).toBe(
      true,
    );
    expect(isChannelFavorite(channel, ['Wedding Crashers'])).toBe(true);
  });

  it('does not match an unrelated id', () => {
    expect(isChannelFavorite(channel, new Set(['movie:999']))).toBe(false);
  });
});

describe('getSeriesId', () => {
  it('prefixes the series name', () => {
    expect(
      getSeriesId({ seriesName: 'Breaking Bad', groupName: 'Shows', episodeCount: 62 }),
    ).toBe('series:Breaking Bad');
  });
});
