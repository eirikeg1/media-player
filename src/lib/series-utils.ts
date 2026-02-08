import type { Channel } from '@/types/playlist.types';

export interface ParsedEpisode {
  season: number;
  episode: number;
  episodeTitle: string;
  channel: Channel;
}

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
      const episodeTitle = title.replace(pattern, '').replace(/^[\s\-:|]+|[\s\-:|]+$/g, '').trim() || title;
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
