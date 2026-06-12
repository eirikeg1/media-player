/**
 * Fixture loaders. Fixtures are realistic, hand-curated sample data shared
 * across test suites — treat them as a stable contract; extend rather than
 * mutate when a test needs new shapes.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

function loadFixture(relativePath: string): string {
  return readFileSync(join(__dirname, relativePath), 'utf-8');
}

/**
 * IPTV playlist with Norwegian/UK live channels (Norway, Sports, News),
 * movies, two series (Breaking Bad, The Wire), and one adult-flagged entry.
 */
export const BASIC_M3U = loadFixture('playlists/basic.m3u');

/** XMLTV guide matching the live channels in {@link BASIC_M3U} (2026-06-12). */
export const BASIC_XMLTV = loadFixture('epg/basic.xml');

/** Channel counts in {@link BASIC_M3U}, for assertion convenience. */
export const BASIC_M3U_COUNTS = {
  total: 16,
  live: 7,
  movies: 4, // includes the adult entry
  seriesEpisodes: 5,
  adult: 1,
};

/** Unix seconds for 2026-06-12 19:30 UTC — mid-programme in BASIC_XMLTV. */
export const EPG_FIXTURE_NOW = Date.UTC(2026, 5, 12, 19, 30, 0) / 1000;
