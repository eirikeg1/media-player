/**
 * Application State Management
 *
 * Organized by domain boundaries:
 * - user: User profiles and settings management
 * - playlist: IPTV playlist and content management
 * - video: Video playback, controls, errors, and network
 */

// Re-export all stores for convenience
export * from './user';
export * from './playlist';
export * from './video';