/**
 * Video Playback State Management
 *
 * All video-related state unified in one domain:
 * - The playback session (owner of the native player) and its timeline
 * - Retry bookkeeping for the video screen
 * - UI controls state
 * - Playback queue (next/previous)
 * - Cast mini-player state
 */
export { useVideoPlayerStore } from './player-store';
export { useVideoRetryStore } from './retry-store';
export { useVideoUIStore } from './ui-store';
export { useCastMiniPlayerStore } from './cast-mini-player-store';
export { useGestureStore } from './gesture-store';
export { usePlaybackQueueStore, type QueueHandover } from './queue-store';
export { usePlaybackTimeStore } from './playback-time-store';
export {
  usePlaybackSessionStore,
  buildVideoSource,
  sessionMatches,
  type PlaybackSession,
  type PlaybackMode,
  type SessionTarget,
} from './playback-session-store';
