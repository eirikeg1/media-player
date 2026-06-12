/**
 * Application State Management
 *
 * Organized by domain boundaries:
 * - app: App-level startup/readiness state
 * - user: User profiles and settings management
 * - playlist: IPTV playlist and content management
 * - video: Video playback, controls, errors, and network
 * - cache: First-page pre-fetch cache for instant tab switching
 */

// Re-export all stores for convenience
export * from './app';
export * from './user';
export * from './playlist';
export * from './video';
export * from './cache';
export * from './header-background';