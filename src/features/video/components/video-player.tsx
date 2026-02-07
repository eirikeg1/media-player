import { VideoView } from 'expo-video';
import { View } from 'react-native';

import { useVideoPlayerStore } from '@/stores/video/player-store';
import type { Channel } from '@/types/playlist.types';
import { useCastPlayback } from '../hooks/use-cast-playback';
import { useVideoPlayerLogic } from '../hooks/use-video-player';
import { LoadingProgress } from './loading-progress';
import { VideoControls, VideoTapOverlay } from './video-controls';
import { VideoCastingState, VideoErrorState } from './video-states';

interface VideoPlayerProps {
  channel: Channel;
  onBack?: () => void;
  onStopVideo?: () => void;
  onRegisterStopFunction?: (stopFn: () => void) => void;
}

/**
 * Video player component with clean, modular state management architecture
 */
export function VideoPlayer({ channel, onBack, onStopVideo, onRegisterStopFunction }: VideoPlayerProps) {
  const {
    player,
    isLoading,
    loadingStage,
    loadingProgress,
    hasError,
    videoError,
    showControls,
    showControlsTemporarily,
    retryPlayback,
    togglePlayPause,
    clearHideControlsTimeout,
    isPlaying,
    networkState,
    retryState,
    toggleControls,
  } = useVideoPlayerLogic({
    channel,
    onStopVideo,
    onRegisterStopFunction,
  });

  const { toggleCastPlayPause, isCastPlaying } = useCastPlayback({ channel });
  const isCasting = useVideoPlayerStore(s => s.isCasting);

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <View style={{ flex: 1 }}>
        {!isCasting && (
          <VideoView
            style={{ flex: 1, width: '100%', height: '100%' }}
            player={player}
            nativeControls={false}
            fullscreenOptions={{ enable: true }}
            allowsPictureInPicture
            contentFit="contain"
          />
        )}

        {isCasting && <VideoCastingState channel={channel} />}
        {isLoading && !isCasting && (
          <LoadingProgress
            channel={channel}
            stage={loadingStage}
            progress={loadingProgress}
            networkType={networkState.type}
          />
        )}
        {hasError && videoError && !isCasting && (
          <VideoErrorState
            channel={channel}
            error={videoError}
            onRetry={retryPlayback}
            isRetrying={retryState.isRetrying}
          />
        )}
        {isCasting && (
          <VideoControls
            channel={channel}
            player={player}
            isLoading={false}
            isPlaying={isCastPlaying}
            onBack={onBack}
            onTogglePlayPause={toggleCastPlayPause}
            onClearTimeout={clearHideControlsTimeout}
            onToggleControls={toggleControls}
          />
        )}
        {showControls && !hasError && !isCasting && (
          <VideoControls
            channel={channel}
            player={player}
            isLoading={isLoading}
            isPlaying={isPlaying}
            onBack={onBack}
            onTogglePlayPause={togglePlayPause}
            onClearTimeout={clearHideControlsTimeout}
            onToggleControls={toggleControls}
          />
        )}
        {!showControls && !hasError && !isLoading && !isCasting && (
          <VideoTapOverlay onTap={() => showControlsTemporarily()} />
        )}
      </View>
    </View>
  );
}

