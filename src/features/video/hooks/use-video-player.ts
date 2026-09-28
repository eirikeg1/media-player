import { useVideoOrchestrator } from './specialized/use-video-orchestrator';

interface UseVideoPlayerProps {
  startPosition?: number;
  onRegisterStopFunction?: (stopFn: () => void) => void;
}

/**
 * Main video player hook. Everything about *what* is playing comes from the
 * playback session; the screen only supplies its own concerns.
 */
export function useVideoPlayerLogic({ startPosition, onRegisterStopFunction }: UseVideoPlayerProps) {
  return useVideoOrchestrator({ startPosition, onRegisterStopFunction });
}
