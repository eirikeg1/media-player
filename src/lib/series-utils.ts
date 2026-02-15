import type { Channel } from '@/types/playlist.types';

export interface ParsedEpisode {
  season: number;
  episode: number;
  episodeTitle: string;
  channel: Channel;
}

// Using RegExp constructor instead of regex literal to prevent Tailwind JIT scanner
// from treating the character class as a utility class and generating invalid CSS.
const TRAILING_PUNCTUATION = new RegExp('[\\-:|]+\\s*$');
const SURROUNDING_PUNCTUATION = new RegExp('^[\\s\\-:|]+|[\\s\\-:|]+$', 'g');

const PATTERNS = [
  // S01E01, S01 E01, s01e01
  /S(\d+)\s*E(\d+)/i,
  // 1x01
  /(\d+)x(\d+)/i,
  // Season 1 Episode 1
  /[Ss]eason\s*(\d+).*[Ee]pisode\s*(\d+)/,
];

/**
 * Parse season/episode info from a channel's title.
 * Falls back to Season 1 with index-based episode number.
 */
export function parseEpisodeInfo(channel: Channel, fallbackIndex: number = 0): ParsedEpisode {
  const title = channel.name;

  for (const pattern of PATTERNS) {
    const match = title.match(pattern);
    if (match) {
      const season = parseInt(match[1], 10);
      const episode = parseInt(match[2], 10);
      // Remove the matched pattern to get the episode title
      const episodeTitle = title.replace(pattern, '').replace(SURROUNDING_PUNCTUATION, '').trim() || title;
      return { season, episode, episodeTitle, channel };
    }
  }

  // Fallback: Season 1, episode = position index + 1
  return {
    season: 1,
    episode: fallbackIndex + 1,
    episodeTitle: title,
    channel,
  };
}

/**
 * Strip episode identifiers from a title to get the base series name.
 * TypeScript equivalent of Rust's `strip_episode_info` SQL function.
 */
export function stripEpisodeInfo(input: string): string {
  let result = input;
  result = result.replace(/S\d+\s*E\d+/gi, '');
  result = result.replace(/\d+x\d+/gi, '');
  result = result.replace(/Season\s*\d+.*?Episode\s*\d+/gi, '');
  result = result.replace(/\s+-\s+-\s+.*/g, '');
  result = result.trim().replace(TRAILING_PUNCTUATION, '').trim();
  return result || 'Untitled';
}

/**
 * Group channels into seasons, sorted by episode number within each season.
 */
export function groupEpisodesBySeason(channels: Channel[]): Map<number, ParsedEpisode[]> {
  const seasons = new Map<number, ParsedEpisode[]>();

  channels.forEach((channel, index) => {
    const parsed = parseEpisodeInfo(channel, index);
    const existing = seasons.get(parsed.season);
    if (existing) {
      existing.push(parsed);
    } else {
      seasons.set(parsed.season, [parsed]);
    }
  });

  // Sort episodes within each season
  for (const episodes of seasons.values()) {
    episodes.sort((a, b) => a.episode - b.episode);
  }

  return seasons;
}
