import { usePlaybackSessionStore } from '@/stores/video/playback-session-store';
import { useCallback, useMemo, useReducer } from 'react';

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

export function useVideoPlayerState() {
  const [state, dispatch] = useReducer(reducer, initialState);

  // The player is owned by the app-wide playback session (started by the
  // video screen route, released only when the session ends), so playback
  // survives this screen unmounting into the mini player bar. The screen
  // only presents and controls it.
  const videoPlayer = usePlaybackSessionStore((s) => s.session?.player ?? null);

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
