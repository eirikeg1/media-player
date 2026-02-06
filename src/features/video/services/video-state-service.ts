import type { VideoPlayer } from 'expo-video';

export class VideoStateService {
  /**
   * Safely execute player action with error handling
   */
  static safePlayerAction(
    player: VideoPlayer | null,
    action: (player: VideoPlayer) => void,
    actionName: string
  ): boolean {
    try {
      if (player) {
        action(player);
        return true;
      }
      console.warn(`Cannot ${actionName}: player is null`);
      return false;
    } catch (error) {
      console.warn(`Error ${actionName}:`, error);
      return false;
    }
  }

  /**
   * Play video safely
   */
  static playVideo(player: VideoPlayer | null): boolean {
    return this.safePlayerAction(player, (p) => p.play(), 'playing video');
  }

  /**
   * Pause video safely
   */
  static pauseVideo(player: VideoPlayer | null): boolean {
    return this.safePlayerAction(player, (p) => p.pause(), 'pausing video');
  }

  /**
   * Replay video safely
   */
  static replayVideo(player: VideoPlayer | null): boolean {
    return this.safePlayerAction(player, (p) => p.replay(), 'replaying video');
  }

  /**
   * Toggle play/pause based on current state
   */
  static togglePlayPause(player: VideoPlayer | null, isPlaying: boolean): boolean {
    if (isPlaying) {
      return this.pauseVideo(player);
    } else {
      return this.playVideo(player);
    }
  }

  /**
   * Get loading stage display text
   */
  static getLoadingStageText(stage: 'connecting' | 'buffering' | 'preparing'): string {
    switch (stage) {
      case 'connecting':
        return 'Connecting to stream...';
      case 'buffering':
        return 'Buffering...';
      case 'preparing':
        return 'Preparing video...';
      default:
        return 'Loading...';
    }
  }

  /**
   * Check if loading stage allows user interaction
   */
  static isInteractiveStage(stage: 'connecting' | 'buffering' | 'preparing'): boolean {
    // During buffering, user can still interact with controls
    return stage === 'buffering';
  }

  /**
   * Get appropriate loading progress for stage
   */
  static getStageProgress(
    stage: 'connecting' | 'buffering' | 'preparing',
    progress?: number
  ): number | undefined {
    switch (stage) {
      case 'connecting':
        return 25; // Show some progress for connection
      case 'buffering':
        return progress; // Use actual buffering progress
      case 'preparing':
        return 75; // Show high progress for preparation
      default:
        return progress;
    }
  }
}