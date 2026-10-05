import { useVideoUIStore } from '@/stores/video/ui-store';
import { useCallback, useMemo } from 'react';
import { VIDEO_CONSTANTS } from '../../constants';

export function useVideoControls() {
  // Selected rather than subscribing to the whole store: `hideControlsTimeoutId`
  // changes on every show/hide and must not re-render the player tree.
  const showControls = useVideoUIStore((s) => s.showControls);
  const setShowControls = useVideoUIStore((s) => s.setShowControls);
  const showControlsTemporarily = useVideoUIStore((s) => s.showControlsTemporarily);
  const clearHideControlsTimeout = useVideoUIStore((s) => s.clearHideControlsTimeout);

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