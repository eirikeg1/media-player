import { usePlaybackSessionStore } from '@/stores/video/playback-session-store';
import { usePlaybackTimeStore } from '@/stores/video/playback-time-store';
import { useCallback, useMemo, useReducer } from 'react';

type LoadingStage = 'connecting' | 'buffering' | 'preparing';

interface LocalPlayerState {
  isLoading: boolean;
  loadingStage: LoadingStage;
}

type Action =
  | { type: 'reset' }
  | { type: 'setIsLoading'; value: boolean }
  | { type: 'setLoadingStage'; value: LoadingStage };

const initialState: LocalPlayerState = {
  isLoading: true,
  loadingStage: 'connecting',
};

function reducer(state: LocalPlayerState, action: Action): LocalPlayerState {
  switch (action.type) {
    case 'reset':
      return initialState;
    case 'setIsLoading':
      return state.isLoading === action.value ? state : { ...state, isLoading: action.value };
    case 'setLoadingStage':
      return state.loadingStage === action.value ? state : { ...state, loadingStage: action.value };
  }
}

/**
 * The loading overlay's state, plus the play/pause commands.
 *
 * Whether playback is actually running is *not* mirrored here — it is published
 * once by `PlaybackSessionHost` into `usePlaybackTimeStore`. The commands below
 * write the expected value straight to that store so the button flips on touch
 * instead of waiting for the native `playingChange` round trip.
 */
export function useVideoPlayerState() {
  const [state, dispatch] = useReducer(reducer, initialState);

  // The player is owned by the app-wide playback session (started by the
  // video screen route, released only when the session ends), so playback
  // survives this screen unmounting into the mini player bar. The screen
  // only presents and controls it.
  const videoPlayer = usePlaybackSessionStore((s) => s.session?.player ?? null);

  // Reads videoPlayer.playing (the native source of truth) so this callback's
  // deps don't include the mirrored `isPlaying`. That keeps `controls` stable
  // across play/pause toggles, which downstream effects rely on.
  const togglePlayPause = useCallback(() => {
    if (!videoPlayer) return;
    try {
      if (videoPlayer.playing) {
        videoPlayer.pause();
        usePlaybackTimeStore.getState().setIsPlaying(false);
      } else {
        videoPlayer.play();
        usePlaybackTimeStore.getState().setIsPlaying(true);
      }
    } catch (error) {
      console.warn('Error toggling play/pause:', error);
    }
  }, [videoPlayer]);

  const stopVideo = useCallback(() => {
    try {
      if (videoPlayer) {
        videoPlayer.pause();
        usePlaybackTimeStore.getState().setIsPlaying(false);
      }
    } catch (error) {
      console.warn('Error stopping video:', error);
    }
  }, [videoPlayer]);

  const playVideo = useCallback(() => {
    try {
      if (videoPlayer) {
        videoPlayer.play();
        usePlaybackTimeStore.getState().setIsPlaying(true);
      }
    } catch (error) {
      console.warn('Error playing video:', error);
    }
  }, [videoPlayer]);

  const pauseVideo = useCallback(() => {
    try {
      if (videoPlayer) {
        videoPlayer.pause();
        usePlaybackTimeStore.getState().setIsPlaying(false);
      }
    } catch (error) {
      console.warn('Error pausing video:', error);
    }
  }, [videoPlayer]);

  const setters = useMemo(() => ({
    setIsLoading: (value: boolean) => dispatch({ type: 'setIsLoading', value }),
    setLoadingStage: (value: LoadingStage) => dispatch({ type: 'setLoadingStage', value }),
    reset: () => dispatch({ type: 'reset' }),
  }), []);

  const controls = useMemo(() => ({
    togglePlayPause,
    stopVideo,
    playVideo,
    pauseVideo,
  }), [togglePlayPause, stopVideo, playVideo, pauseVideo]);

  return useMemo(() => ({
    player: videoPlayer,
    isLoading: state.isLoading,
    loadingStage: state.loadingStage,
    setters,
    controls,
  }), [videoPlayer, state.isLoading, state.loadingStage, setters, controls]);
}
