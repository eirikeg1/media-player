import type { Channel } from '@/types/playlist.types';
import type { ContentType } from '@/types/user.types';
import { useVideoOrchestrator } from './specialized/use-video-orchestrator';

interface UseVideoPlayerProps {
  channel: Channel;
  playlistId: string;
  contentType: ContentType;
  onStopVideo?: () => void;
  onRegisterStopFunction?: (stopFn: () => void) => void;
}

/**
 * Main video player hook with clean, modular architecture
 */
export function useVideoPlayerLogic({ channel, playlistId, contentType, onStopVideo, onRegisterStopFunction }: UseVideoPlayerProps) {
  return useVideoOrchestrator({
    channel,
    playlistId,
    contentType,
    onStopVideo,
    onRegisterStopFunction,
  });
}