import type { Channel } from '@/types/playlist.types';
import { useVideoOrchestrator } from './specialized/use-video-orchestrator';

interface UseVideoPlayerProps {
  channel: Channel;
  onStopVideo?: () => void;
  onRegisterStopFunction?: (stopFn: () => void) => void;
}

/**
 * Main video player hook with clean, modular architecture
 */
export function useVideoPlayerLogic({ channel, onStopVideo, onRegisterStopFunction }: UseVideoPlayerProps) {
  return useVideoOrchestrator({
    channel,
    onStopVideo,
    onRegisterStopFunction,
  });
}