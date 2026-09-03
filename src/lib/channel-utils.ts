import type { Channel } from '@/types/playlist.types';
import type { SeriesInfo } from 'expo-m3u-parser';

/**
 * Generate a consistent unique identifier for a channel
 * Uses tvg.id if available, otherwise falls back to name|url
 */
export function getChannelId(channel: Channel): string {
  if (channel.tvg?.id && channel.tvg.id.trim().length > 0) {
    return channel.tvg.id.trim();
  }

  // Fallback to name|url for channels without tvg.id
  return `${channel.name}|${channel.url}`;
}

/**
 * Generate channel ID for raw parsed items (before type casting)
 * Used during playlist parsing for deduplication
 */
export function getRawChannelId(item: any): string {
  const tvgId = item.tvg?.id || item.tvgId;
  if (tvgId && typeof tvgId === 'string' && tvgId.trim().length > 0) {
    return tvgId.trim();
  }

  // Fallback to name|url
  const name = item.name || '';
  const url = item.url || '';
  return `${name}|${url}`;
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
 * Check if a series is marked as favorite
 */
export function isSeriesFavorite(series: SeriesInfo, favoriteChannels: string[]): boolean {
  return favoriteChannels.includes(getSeriesId(series));
}

/**
 * Check if a channel is marked as favorite
 * Handles backward compatibility with old favorite formats
 */
export function isChannelFavorite(channel: Channel, favoriteChannels: string[]): boolean {
  const channelId = getChannelId(channel);
  return favoriteChannels.includes(channelId) ||
         favoriteChannels.includes(`${channel.name}|${channel.url}`) ||
         favoriteChannels.includes(channel.name);
}

/**
 * Sort channels with favorites first, then alphabetically
 */
export function sortChannelsWithFavorites(channels: Channel[], favoriteChannels: string[]): Channel[] {
  if (favoriteChannels.length === 0) {
    return channels.sort((a, b) => a.name.localeCompare(b.name));
  }

  let favoriteMatches = 0;
  const sortedChannels = channels.sort((a, b) => {
    const aIsFavorite = isChannelFavorite(a, favoriteChannels);
    const bIsFavorite = isChannelFavorite(b, favoriteChannels);

    if (aIsFavorite) favoriteMatches++;
    if (bIsFavorite && !aIsFavorite) favoriteMatches++;

    if (aIsFavorite && !bIsFavorite) return -1;
    if (!aIsFavorite && bIsFavorite) return 1;

    return a.name.localeCompare(b.name);
  });

  console.log(`[sortChannelsWithFavorites] Found ${favoriteMatches} favorite channels in current view`);
  return sortedChannels;
}

/**
 * Filter channels by group name
 */
export function filterChannelsByGroup(channels: Channel[], groupName: string): Channel[] {
  if (!groupName) return channels;

  return channels.filter((channel) => {
    const channelGroup = channel.group.title || 'Uncategorized';
    return channelGroup === groupName;
  });
}

/**
 * Filter channels by search text
 */
export function filterChannelsBySearch(channels: Channel[], searchText: string): Channel[] {
  if (!searchText.trim()) return channels;

  const searchLower = searchText.toLowerCase().trim();
  return channels.filter((channel) =>
    channel.name.toLowerCase().includes(searchLower)
  );
}