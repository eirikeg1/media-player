import {
  getSeriesNameForChannel,
  groupEpisodesBySeason,
  parseEpisodeInfo,
  sortEpisodes,
  stripEpisodeInfo,
} from '../series-utils';
import type { Channel } from '@/types/playlist.types';

function makeChannel(name: string): Channel {
  return { name, url: 'http://example.com', tvg: {}, group: { title: 'Drama' } };
}

describe('stripEpisodeInfo', () => {
  it('strips S01E01 pattern', () => {
    expect(stripEpisodeInfo('Breaking Bad S01E01')).toBe('Breaking Bad');
  });

  it('strips case-insensitive s01e01', () => {
    expect(stripEpisodeInfo('Breaking Bad s03e02')).toBe('Breaking Bad');
  });

  it('strips 1x01 pattern', () => {
    expect(stripEpisodeInfo('Friends 1x01')).toBe('Friends');
  });

  it('strips Season/Episode pattern', () => {
    expect(stripEpisodeInfo('The Office Season 2 Episode 3')).toBe('The Office');
  });

  it('strips double-dash pattern', () => {
    expect(stripEpisodeInfo('Breaking Bad - - Pilot')).toBe('Breaking Bad');
  });

  it('strips trailing separators after pattern removal', () => {
    expect(stripEpisodeInfo('Breaking Bad - S01E01')).toBe('Breaking Bad');
    expect(stripEpisodeInfo('Breaking Bad: S01E01')).toBe('Breaking Bad');
  });

  it('returns "Untitled" when result is empty', () => {
    expect(stripEpisodeInfo('S01E01')).toBe('Untitled');
  });

  it('returns full name when no episode info', () => {
    expect(stripEpisodeInfo('Breaking Bad')).toBe('Breaking Bad');
  });
});

describe('parseEpisodeInfo', () => {
  it('extracts season and episode from S01E02', () => {
    const result = parseEpisodeInfo(makeChannel('Breaking Bad S01E02'));
    expect(result.season).toBe(1);
    expect(result.episode).toBe(2);
  });

  it('extracts from 1x05 format', () => {
    const result = parseEpisodeInfo(makeChannel('Friends 1x05'));
    expect(result.season).toBe(1);
    expect(result.episode).toBe(5);
  });

  it('extracts from Season/Episode format', () => {
    const result = parseEpisodeInfo(makeChannel('The Office Season 2 Episode 3'));
    expect(result.season).toBe(2);
    expect(result.episode).toBe(3);
  });

  it('falls back to Season 1 with index-based episode', () => {
    const result = parseEpisodeInfo(makeChannel('No Episode Info'), 4);
    expect(result.season).toBe(1);
    expect(result.episode).toBe(5); // fallbackIndex + 1
    expect(result.episodeTitle).toBe('No Episode Info');
  });

  it('returns episode title stripped of pattern', () => {
    const result = parseEpisodeInfo(makeChannel('Show S01E01 Pilot'));
    expect(result.episodeTitle).toBe('Show  Pilot');
  });
});

describe('getSeriesNameForChannel', () => {
  it('derives the series name from the channel title', () => {
    expect(getSeriesNameForChannel(makeChannel('Breaking Bad S01E01'))).toBe('Breaking Bad');
  });

  it('ignores tvgName, which may name the series differently', () => {
    const channel = { ...makeChannel('Breaking Bad S01E01'), tvg: { name: 'BB (2008)' } };
    expect(getSeriesNameForChannel(channel)).toBe('Breaking Bad');
  });
});

describe('sortEpisodes', () => {
  it('orders by season then episode', () => {
    const sorted = sortEpisodes([
      makeChannel('Show S02E01'),
      makeChannel('Show S01E02'),
      makeChannel('Show S01E01'),
    ]);

    expect(sorted.map((episode) => episode.channel.name)).toEqual([
      'Show S01E01',
      'Show S01E02',
      'Show S02E01',
    ]);
  });

  it('keeps the incoming order of titles with no recognisable pattern', () => {
    // Without the index these all parse as S01E01 and the order becomes
    // whatever the sort happens to do.
    const sorted = sortEpisodes([
      makeChannel('Pilot'),
      makeChannel('The Reveal'),
      makeChannel('Finale'),
    ]);

    expect(sorted.map((episode) => episode.channel.name)).toEqual([
      'Pilot',
      'The Reveal',
      'Finale',
    ]);
    expect(sorted.map((episode) => episode.episode)).toEqual([1, 2, 3]);
  });

  it('is stable for duplicate season/episode numbers', () => {
    const sorted = sortEpisodes([
      makeChannel('Show S01E01 (1080p)'),
      makeChannel('Show S01E01 (720p)'),
    ]);

    expect(sorted.map((episode) => episode.channel.name)).toEqual([
      'Show S01E01 (1080p)',
      'Show S01E01 (720p)',
    ]);
  });
});

describe('groupEpisodesBySeason', () => {
  it('groups channels into seasons', () => {
    const channels = [
      makeChannel('Show S01E01'),
      makeChannel('Show S01E03'),
      makeChannel('Show S02E01'),
    ];
    const seasons = groupEpisodesBySeason(channels);
    expect(seasons.size).toBe(2);
    expect(seasons.get(1)!.length).toBe(2);
    expect(seasons.get(2)!.length).toBe(1);
  });

  it('sorts episodes within a season by episode number', () => {
    const channels = [
      makeChannel('Show S01E03'),
      makeChannel('Show S01E01'),
      makeChannel('Show S01E02'),
    ];
    const seasons = groupEpisodesBySeason(channels);
    const episodes = seasons.get(1)!;
    expect(episodes.map((e) => e.episode)).toEqual([1, 2, 3]);
  });

  it('handles channels without episode info', () => {
    const channels = [makeChannel('No Pattern A'), makeChannel('No Pattern B')];
    const seasons = groupEpisodesBySeason(channels);
    expect(seasons.get(1)!.length).toBe(2);
  });
});
