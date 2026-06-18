import { useVideoPlayerStore } from '@/stores/video/player-store';
import type { Channel } from '@/types/playlist.types';
import { useVideoPlayer, type VideoSource } from 'expo-video';
import { useCallback, useEffect, useMemo, useReducer } from 'react';

type LoadingStage = 'connecting' | 'buffering' | 'preparing';

interface LocalPlayerState {
  isPlaying: boolean;
  isLoading: boolean;
  loadingStage: LoadingStage;
  loadingProgress: number | undefined;
}

type Action =
  | { type: 'reset' }
  | { type: 'setIsPlaying'; value: boolean }
  | { type: 'setIsLoading'; value: boolean }
  | { type: 'setLoadingStage'; value: LoadingStage }
  | { type: 'setLoadingProgress'; value: number | undefined };

const initialState: LocalPlayerState = {
  isPlaying: false,
  isLoading: true,
  loadingStage: 'connecting',
  loadingProgress: undefined,
};

function reducer(state: LocalPlayerState, action: Action): LocalPlayerState {
  switch (action.type) {
    case 'reset':
      return initialState;
    case 'setIsPlaying':
      return state.isPlaying === action.value ? state : { ...state, isPlaying: action.value };
    case 'setIsLoading':
      return state.isLoading === action.value ? state : { ...state, isLoading: action.value };
    case 'setLoadingStage':
      return state.loadingStage === action.value ? state : { ...state, loadingStage: action.value };
    case 'setLoadingProgress':
      return state.loadingProgress === action.value ? state : { ...state, loadingProgress: action.value };
  }
}

interface UseVideoPlayerStateProps {
  channel: Channel;
}

export function useVideoPlayerState({ channel }: UseVideoPlayerStateProps) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const setPlayer = useVideoPlayerStore((s) => s.setPlayer);

  // Forward the channel's HTTP headers (User-Agent / Referer) to the native
  // player. Many IPTV streams are header-gated and reject the default player
  // User-Agent with an IOException when these aren't sent.
  const videoSource = useMemo<VideoSource>(() => {
    const headers: Record<string, string> = {};
    if (channel.http?.userAgent) headers['User-Agent'] = channel.http.userAgent;
    if (channel.http?.referrer) headers['Referer'] = channel.http.referrer;
    return Object.keys(headers).length > 0 ? { uri: channel.url, headers } : { uri: channel.url };
  }, [channel.url, channel.http?.userAgent, channel.http?.referrer]);

  const videoPlayer = useVideoPlayer(videoSource, (player) => {
    player.loop = false;
    player.muted = false;
    player.timeUpdateEventInterval = 0.5;
    setPlayer(player);
  });

  useEffect(() => {
    return () => {
      if (videoPlayer) {
        void videoPlayer.replaceAsync(null).catch((error) => {
          console.warn('Error unloading video source during cleanup:', error);
        });
      }
    };
  }, [videoPlayer]);

  // Reads videoPlayer.playing (the native source of truth) so this callback's
  // deps don't include React's mirrored `isPlaying`. That keeps `controls`
  // stable across play/pause toggles, which downstream effects rely on.
  const togglePlayPause = useCallback(() => {
    if (!videoPlayer) {
      console.log('No video player available');
      return;
    }
    try {
      if (videoPlayer.playing) {
        console.log('Pausing video');
        videoPlayer.pause();
        dispatch({ type: 'setIsPlaying', value: false });
      } else {
        console.log('Playing video');
        videoPlayer.play();
        dispatch({ type: 'setIsPlaying', value: true });
      }
    } catch (error) {
      console.warn('Error toggling play/pause:', error);
    }
  }, [videoPlayer]);

  const stopVideo = useCallback(() => {
    try {
      if (videoPlayer) {
        videoPlayer.pause();
        dispatch({ type: 'setIsPlaying', value: false });
      }
    } catch (error) {
      console.warn('Error stopping video:', error);
    }
  }, [videoPlayer]);

  const playVideo = useCallback(() => {
    console.log('playVideo called');
    try {
      if (videoPlayer) {
        videoPlayer.play();
        dispatch({ type: 'setIsPlaying', value: true });
        console.log('Video play() called, state set to true');
      }
    } catch (error) {
      console.warn('Error playing video:', error);
    }
  }, [videoPlayer]);

  const pauseVideo = useCallback(() => {
    console.log('pauseVideo called');
    try {
      if (videoPlayer) {
        videoPlayer.pause();
        dispatch({ type: 'setIsPlaying', value: false });
        console.log('Video pause() called, state set to false');
      }
    } catch (error) {
      console.warn('Error pausing video:', error);
    }
  }, [videoPlayer]);

  const replayVideo = useCallback(() => {
    try {
      if (videoPlayer) {
        videoPlayer.replay();
      }
    } catch (error) {
      console.warn('Error replaying video:', error);
    }
  }, [videoPlayer]);

  const setters = useMemo(() => ({
    setIsPlaying: (value: boolean) => dispatch({ type: 'setIsPlaying', value }),
    setIsLoading: (value: boolean) => dispatch({ type: 'setIsLoading', value }),
    setLoadingStage: (value: LoadingStage) => dispatch({ type: 'setLoadingStage', value }),
    setLoadingProgress: (value: number | undefined) => dispatch({ type: 'setLoadingProgress', value }),
    reset: () => dispatch({ type: 'reset' }),
  }), []);

  const controls = useMemo(() => ({
    togglePlayPause,
    stopVideo,
    playVideo,
    pauseVideo,
    replayVideo,
  }), [togglePlayPause, stopVideo, playVideo, pauseVideo, replayVideo]);

  return useMemo(() => ({
    player: videoPlayer,
    isPlaying: state.isPlaying,
    isLoading: state.isLoading,
    loadingStage: state.loadingStage,
    loadingProgress: state.loadingProgress,
    setters,
    controls,
  }), [
    videoPlayer,
    state.isPlaying,
    state.isLoading,
    state.loadingStage,
    state.loadingProgress,
    setters,
    controls,
  ]);
}
