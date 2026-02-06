import { useVideoPlayerStore } from '@/states/video/player-store';
import type { Channel } from '@/types/playlist.types';
import { useVideoPlayer } from 'expo-video';
import { useCallback, useMemo } from 'react';

interface UseVideoPlayerStateProps {
  channel: Channel;
}

export function useVideoPlayerState({ channel }: UseVideoPlayerStateProps) {
  const {
    isPlaying,
    isLoading,
    loadingStage,
    loadingProgress,
    setPlayer,
    setIsPlaying,
    setIsLoading,
    setLoadingStage,
    setLoadingProgress,
  } = useVideoPlayerStore();

  const videoPlayer = useVideoPlayer(channel.url, (player) => {
    player.loop = false;
    player.muted = false;
    setPlayer(player);
  });

  const togglePlayPause = useCallback(() => {
    console.log('togglePlayPause called, current isPlaying:', isPlaying);
    try {
      if (videoPlayer) {
        if (isPlaying) {
          console.log('Pausing video');
          videoPlayer.pause();
          setIsPlaying(false);
        } else {
          console.log('Playing video');
          videoPlayer.play();
          setIsPlaying(true);
        }
      } else {
        console.log('No video player available');
      }
    } catch (error) {
      console.warn('Error toggling play/pause:', error);
    }
  }, [videoPlayer, isPlaying, setIsPlaying]);

  const stopVideo = useCallback(() => {
    try {
      if (videoPlayer) {
        videoPlayer.pause();
        setIsPlaying(false);
      }
    } catch (error) {
      console.warn('Error stopping video:', error);
    }
  }, [videoPlayer, setIsPlaying]);

  const playVideo = useCallback(() => {
    console.log('playVideo called');
    try {
      if (videoPlayer) {
        videoPlayer.play();
        setIsPlaying(true);
        console.log('Video play() called, state set to true');
      }
    } catch (error) {
      console.warn('Error playing video:', error);
    }
  }, [videoPlayer, setIsPlaying]);

  const pauseVideo = useCallback(() => {
    console.log('pauseVideo called');
    try {
      if (videoPlayer) {
        videoPlayer.pause();
        setIsPlaying(false);
        console.log('Video pause() called, state set to false');
      }
    } catch (error) {
      console.warn('Error pausing video:', error);
    }
  }, [videoPlayer, setIsPlaying]);

  const replayVideo = useCallback(() => {
    try {
      if (videoPlayer) {
        videoPlayer.replay();
      }
    } catch (error) {
      console.warn('Error replaying video:', error);
    }
  }, [videoPlayer]);

  const actions = useMemo(() => ({
    setIsPlaying,
    setIsLoading,
    setLoadingStage,
    setLoadingProgress,
    togglePlayPause,
    stopVideo,
    playVideo,
    pauseVideo,
    replayVideo,
  }), [
    setIsPlaying,
    setIsLoading,
    setLoadingStage,
    setLoadingProgress,
    togglePlayPause,
    stopVideo,
    playVideo,
    pauseVideo,
    replayVideo,
  ]);

  return useMemo(() => ({
    player: videoPlayer,
    isPlaying,
    isLoading,
    loadingStage,
    loadingProgress,
    actions,
  }), [
    videoPlayer,
    isPlaying,
    isLoading,
    loadingStage,
    loadingProgress,
    actions,
  ]);
}