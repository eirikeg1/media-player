import type { Channel } from '@/types/playlist.types';
import type { SeriesInfo } from 'expo-m3u-parser';

/** The kinds an Xtream URL path can name. */
const STREAM_KINDS = ['movie', 'series', 'live'] as const;
type StreamKind = (typeof STREAM_KINDS)[number];

/**
 * The id prefix per kind — mirrors Rust `m3u_types::id_prefix`. A series
 * *episode* is `episode:`, not `series:`, because `series:` is the prefix of
 * `getSeriesId` (a whole series by name), and a series literally named "1923"
 * would otherwise collide with an episode whose stream id is 1923.
 */
const ID_PREFIX: Record<StreamKind, string> = { movie: 'movie', series: 'episode', live: 'live' };

/**
 * The path of a URL, without the query string or fragment. Deliberately not
 * `new URL()`: this runs per channel over lists of thousands.
 */
function urlPath(url: string): string {
  const afterScheme = url.slice(url.includes('://') ? url.indexOf('://') + 3 : 0);
  const start = afterScheme.indexOf('/');
  if (start === -1) return '';
  const path = afterScheme.slice(start);
  const end = path.search(/[?#]/);
  return end === -1 ? path : path.slice(0, end);
}

/**
 * `"{kind}:{streamId}"` for an Xtream stream URL, else null.
 *
 * The kind comes from the path (`/movie/`, `/series/`, `/live/`) rather than
 * the channel's own content type, so a stored id can be re-derived from the URL
 * alone — which is what lets legacy ids be remapped natively.
 */
function streamIdFromUrl(url: string): string | null {
  const path = urlPath(url);
  const segments = path.split('/');
  // Plain decimal digits, which is what every panel serves; Rust parses the
  // same segment as an i64, so anything signed or oversized is no id on either
  // side and both fall through to the `name|url` form.
  const streamId = segments[segments.length - 1]?.split('.')[0];
  if (!streamId || !/^\d{1,18}$/.test(streamId)) return null;

  const kind = segments
    .map((segment) => segment.toLowerCase())
    .find((segment): segment is StreamKind => (STREAM_KINDS as readonly string[]).includes(segment));
  return kind ? `${ID_PREFIX[kind]}:${streamId}` : null;
}

/**
 * The stable identifier the app keys viewing history, continue-watching,
 * favourites and reactions on.
 *
 * Mirrors `channel_id_for` in the Rust backend (`crates/m3u-types/src/lib.rs`)
 * exactly — the two are held together by a shared test table, because an id the
 * app derives here has to match the one stored in the channel catalogue:
 *
 * 1. `tvg.id` when non-empty;
 * 2. else `"{kind}:{streamId}"` from an Xtream URL (`movie:12345`), which
 *    survives the title rewrites panels give VOD entries;
 * 3. else `"{name}|{url}"`, for plain M3U entries with no stream id.
 */
export function getChannelId(channel: Channel): string {
  const tvgId = channel.tvg?.id?.trim();
  if (tvgId) return tvgId;

  return streamIdFromUrl(channel.url) ?? `${channel.name}|${channel.url}`;
}

/**
 * {@link getChannelId} for raw parsed items (before type casting).
 * Used during playlist parsing for deduplication.
 */
export function getRawChannelId(item: any): string {
  const rawTvgId = item.tvg?.id || item.tvgId;
  const tvgId = typeof rawTvgId === 'string' ? rawTvgId.trim() : '';
  if (tvgId) return tvgId;

  const name = item.name || '';
  const url = item.url || '';
  return streamIdFromUrl(url) ?? `${name}|${url}`;
}

/**
 * The id a legacy `"{name}|{url}"` id maps to under the current rule, or null
 * when there is no Xtream stream URL inside it to derive one from (a plain-M3U
 * id, a `tvg.id`, or an id that is already current).
 *
 * The TS mirror of `map_legacy_channel_id` in the Rust backend. The app remaps
 * its stored ids through the native export — this exists so the in-memory
 * backend fake answers the same way, off the one implementation of the rule.
 *
 * A name may itself contain `|` ("BBC One | HD"), a URL may not, so the split
 * is on the last one.
 */
export function mapLegacyChannelId(legacyId: string): string | null {
  const separator = legacyId.lastIndexOf('|');
  if (separator === -1) return null;
  return streamIdFromUrl(legacyId.slice(separator + 1));
}

/**
 * Marks an id as a series name rather than a channel id, so favorites and
 * reactions can share one keyspace.
 */
export const SERIES_ID_PREFIX = 'series:';

/**
 * Generate a consistent unique identifier for a series
 */
export function getSeriesId(series: SeriesInfo): string {
  return `${SERIES_ID_PREFIX}${series.seriesName}`;
}

/**
 * A collection of favorite ids. A `Set` keeps per-row lookups O(1) for lists
 * that check every visible item; an array is accepted for one-off checks.
 */
export type FavoriteIds = readonly string[] | ReadonlySet<string>;

function isIdSet(favorites: FavoriteIds): favorites is ReadonlySet<string> {
  return favorites instanceof Set;
}

function hasFavoriteId(favorites: FavoriteIds, id: string): boolean {
  return isIdSet(favorites) ? favorites.has(id) : favorites.includes(id);
}

/**
 * Check if a series is marked as favorite
 */
export function isSeriesFavorite(series: SeriesInfo, favoriteChannels: FavoriteIds): boolean {
  return hasFavoriteId(favoriteChannels, getSeriesId(series));
}

/**
 * Check if a channel is marked as favorite
 * Handles backward compatibility with old favorite formats
 */
export function isChannelFavorite(channel: Channel, favoriteChannels: FavoriteIds): boolean {
  return (
    hasFavoriteId(favoriteChannels, getChannelId(channel)) ||
    hasFavoriteId(favoriteChannels, `${channel.name}|${channel.url}`) ||
    hasFavoriteId(favoriteChannels, channel.name)
  );
}