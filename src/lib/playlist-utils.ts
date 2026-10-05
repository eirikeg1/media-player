/**
 * Utility functions for playlist management
 */

// Constants
const PLAYLIST_NAME_MAX_LENGTH = 100;
const MS_PER_MINUTE = 60000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const RANDOM_ID_LENGTH = 7;

/**
 * Generate a unique ID for a playlist
 * Format: playlist-{timestamp}-{random}
 * @returns A unique playlist identifier
 * @example "playlist-1234567890-abc1234"
 */
export function generatePlaylistId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 2 + RANDOM_ID_LENGTH);
  return `playlist-${timestamp}-${random}`;
}

/**
 * Format a date to a readable string
 * @param date - The date to format
 * @returns Formatted date string in US locale
 * @example "Jan 1, 2024, 12:00 PM"
 */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/**
 * Get time elapsed since a date in human-readable format
 * @param date - The date to compare against current time
 * @returns Human-readable time elapsed string
 * @example "2 hours ago", "Just now", "3 days ago"
 */
export function getTimeElapsed(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / MS_PER_MINUTE);
  const diffHours = Math.floor(diffMins / MINUTES_PER_HOUR);
  const diffDays = Math.floor(diffHours / HOURS_PER_DAY);

  if (diffDays > 0) {
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  }
  if (diffHours > 0) {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  }
  if (diffMins > 0) {
    return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  }
  return 'Just now';
}

/**
 * Sanitize playlist name by trimming whitespace and limiting length
 * @param name - The playlist name to sanitize
 * @returns Sanitized playlist name
 * @example sanitizePlaylistName("  My Playlist  ") => "My Playlist"
 */
export function sanitizePlaylistName(name: string): string {
  return name.trim().substring(0, PLAYLIST_NAME_MAX_LENGTH);
}

/**
 * Extract domain from URL for display purposes
 * @param url - The URL to extract domain from
 * @returns The hostname/domain, or original URL if parsing fails
 * @example extractDomain("https://example.com/playlist.m3u") => "example.com"
 */
export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return url;
  }
}

/**
 * Extract clean URL without query parameters for display purposes
 * @param url - The URL to clean
 * @returns The URL without query parameters, or original URL if parsing fails
 * @example extractCleanUrl("https://example.com/playlist.m3u?token=123") => "example.com/playlist.m3u"
 */
export function extractCleanUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname + urlObj.pathname;
  } catch {
    return url;
  }
}
