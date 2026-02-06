import { useVideoUIStore } from '@/states/video/ui-store';
import { useCallback, useMemo } from 'react';
import { VIDEO_CONSTANTS } from '../../constants';

export function useVideoControls() {
  const {
    showControls,
    setShowControls,
    showControlsTemporarily,
    clearHideControlsTimeout,
  } = useVideoUIStore();

  const scheduleHideControls = useCallback((timeoutMs?: number) => {
    showControlsTemporarily(timeoutMs ?? VIDEO_CONSTANTS.CONTROLS_HIDE_TIMEOUT);
  }, [showControlsTemporarily]);

  const showControlsAndScheduleHide = useCallback(() => {
    setShowControls(true);
    scheduleHideControls();
  }, [setShowControls, scheduleHideControls]);

  const hideControls = useCallback(() => {
    clearHideControlsTimeout();
    setShowControls(false);
  }, [clearHideControlsTimeout, setShowControls]);

  const toggleControls = useCallback(() => {
    if (showControls) {
      hideControls();
    } else {
      showControlsAndScheduleHide();
    }
  }, [showControls, hideControls, showControlsAndScheduleHide]);

  const actions = useMemo(() => ({
    showControlsTemporarily,
    showControlsAndScheduleHide,
    hideControls,
    toggleControls,
    clearHideControlsTimeout,
    scheduleHideControls,
  }), [
    showControlsTemporarily,
    showControlsAndScheduleHide,
    hideControls,
    toggleControls,
    clearHideControlsTimeout,
    scheduleHideControls,
  ]);

  return useMemo(() => ({
    showControls,
    actions,
  }), [showControls, actions]);
}