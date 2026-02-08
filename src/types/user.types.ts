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
 * Watch history entry
 */
export interface UserWatchHistory {
  id: string;
  userId: string;
  channelId: string;
  watchedAt: Date;
  duration: number; // seconds watched
}

/**
 * Playback position for resume feature
 */
export interface UserPlaybackPosition {
  id: string;
  userId: string;
  channelId: string;
  position: number; // current position in seconds
  totalDuration: number; // total duration in seconds
  updatedAt: Date;
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
  parentalControlEnabled: true,
};
