import type { Channel } from '@/types/playlist.types';
import { useVideoOrchestrator } from './specialized/use-video-orchestrator';

interface UseVideoPlayerProps {
  channel: Channel;
  startPosition?: number;
  onStopVideo?: () => void;
  onRegisterStopFunction?: (stopFn: () => void) => void;
}

/**
 * Main video player hook with clean, modular architecture
 */
export function useVideoPlayerLogic({ channel, startPosition, onStopVideo, onRegisterStopFunction }: UseVideoPlayerProps) {
  return useVideoOrchestrator({
    channel,
    startPosition,
    onStopVideo,
    onRegisterStopFunction,
  });
}