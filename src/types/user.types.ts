/**
 * User profile entity
 */
export interface User {
  id: string;
  username: string;
  avatarUrl?: string;
  pin?: string;
  createdAt: Date;
  updatedAt: Date;
  lastActiveAt?: Date;
  settings?: UserSettings;
}

/**
 * How often sports data is refreshed without the user asking.
 *
 * - `off`: never refresh in the background.
 * - `interval`: every {@link SportsBackgroundRefresh.intervalHours} hours.
 * - `daily`: once a day at {@link SportsBackgroundRefresh.dailyTime}.
 * - `night`: once per night, inside the quiet window.
 */
export type SportsRefreshMode = 'off' | 'interval' | 'daily' | 'night';

/** Sports background-refresh preference. */
export interface SportsBackgroundRefresh {
  mode: SportsRefreshMode;
  /** Hours between runs in 'interval' mode. */
  intervalHours: number;
  /** "HH:MM" local time for 'daily' mode. */
  dailyTime: string;
  /** Refresh in the foreground when the app becomes active and data is stale. */
  refreshOnOpen: boolean;
}

export const DEFAULT_SPORTS_BACKGROUND_REFRESH: SportsBackgroundRefresh = {
  // Nightly by default: the schedule rarely changes more than daily, and the
  // 02-06 window tends to coincide with charging + idle.
  mode: 'night',
  intervalHours: 4,
  dailyTime: '07:00',
  refreshOnOpen: true,
};

/**
 * User preferences and settings
 */
export interface UserSettings {
  userId: string;
  theme: 'light' | 'dark' | 'system';
  language: string;
  defaultQuality: 'auto' | 'low' | 'high';
  defaultSubtitles: 'off' | 'on';
  activePlaylistId?: string;
  channelSortBy: 'name' | 'recent' | 'custom' | 'mostWatched' | 'favorites';
  parentalControlEnabled: boolean;
  parentalControlPin?: string;
  showHomeTab: boolean;
  showLiveTab: boolean;
  showVideosTab: boolean;
  showSportsTab: boolean;
  playlistSharingEnabled: boolean;
  privateModeExpiresAt?: string;
  shareUploadedBackgrounds: boolean;
  sportsCountry?: string;
  /** SofaScore unique-tournament ids in the user's preferred display order. */
  sportsLeagueOrder?: number[];
  /** Hide competitions that are not in `sportsLeagueOrder` from the matches list. */
  sportsHideOtherLeagues: boolean;
  /** When sports data refreshes on its own. Absent = {@link DEFAULT_SPORTS_BACKGROUND_REFRESH}. */
  sportsBackgroundRefresh?: SportsBackgroundRefresh;
}

/**
 * Check if private mode is currently active (not expired)
 */
export function isPrivateModeActive(settings?: UserSettings): boolean {
  if (!settings?.privateModeExpiresAt) return false;
  return new Date(settings.privateModeExpiresAt).getTime() > Date.now();
}

/**
 * User's favorite channel
 */
export interface UserFavoriteChannel {
  id: string;
  userId: string;
  channelId: string;
  addedAt: Date;
}

/**
 * User's hidden channel
 */
export interface UserHiddenChannel {
  id: string;
  userId: string;
  channelId: string;
  hiddenAt: Date;
}

/**
 * User's custom channel ordering
 */
export interface UserChannelOrder {
  id: string;
  userId: string;
  channelId: string;
  sortOrder: number;
}

/**
 * Content type for viewing history
 */
export type ContentType = 'live' | 'movie' | 'series';

/**
 * A single viewing session (raw event log row)
 */
export interface ViewingSession {
  id: string;
  userId: string;
  playlistId: string;
  channelId: string;
  channelName: string;
  groupTitle?: string;
  contentType: ContentType;
  tvgLogo?: string;
  startedAt: string;
  endedAt?: string;
  durationWatched: number;
  startPosition: number;
  endPosition: number;
  totalDuration?: number;
  dayOfWeek: number;
  hourOfDay: number;
  completed: boolean;
}

/**
 * Aggregated watch stats per channel (per user + playlist)
 */
export interface ChannelWatchStats {
  userId: string;
  playlistId: string;
  channelId: string;
  channelName: string;
  groupTitle?: string;
  contentType: ContentType;
  tvgLogo?: string;
  watchCount: number;
  totalTimeWatched: number;
  lastWatchedAt: string;
  firstWatchedAt: string;
  lastPosition: number;
  totalDuration?: number;
  completionCount: number;
  avgSessionDuration: number;
  longestSessionDuration: number;
}

/**
 * Aggregated watch stats per group (per user + playlist)
 */
export interface GroupWatchStats {
  userId: string;
  playlistId: string;
  groupTitle: string;
  watchCount: number;
  totalTimeWatched: number;
  uniqueChannelsWatched: number;
  lastWatchedAt: string;
}

/**
 * Item for "Continue Watching" row
 */
export interface ContinueWatchingItem {
  channelId: string;
  channelName: string;
  groupTitle?: string;
  contentType: ContentType;
  tvgLogo?: string;
  lastPosition: number;
  totalDuration?: number;
  lastWatchedAt: string;
}

/**
 * Item for "Recently Watched" row
 */
export interface RecentlyWatchedItem {
  channelId: string;
  channelName: string;
  groupTitle?: string;
  contentType: ContentType;
  tvgLogo?: string;
  watchCount: number;
  lastWatchedAt: string;
  lastPosition?: number;
  totalDuration?: number;
  nextEpisodeChannelId?: string;
  nextEpisodeChannelName?: string;
  seriesName?: string;
  seriesPoster?: string;
}

/**
 * Input data for creating a new user
 */
export interface CreateUserInput {
  username: string;
  avatarUrl?: string;
  pin?: string;
}

/**
 * Input data for updating user profile
 */
export interface UpdateUserInput {
  username?: string;
  avatarUrl?: string;
  pin?: string;
}

/**
 * Default user settings
 */
export const DEFAULT_USER_SETTINGS: Omit<UserSettings, 'userId'> = {
  theme: 'system',
  language: 'en',
  defaultQuality: 'auto',
  defaultSubtitles: 'off',
  activePlaylistId: undefined,
  channelSortBy: 'name',
  parentalControlEnabled: false,
  showHomeTab: true,
  showLiveTab: true,
  showVideosTab: true,
  showSportsTab: true,
  playlistSharingEnabled: true,
  shareUploadedBackgrounds: true,
  sportsHideOtherLeagues: false,
};
