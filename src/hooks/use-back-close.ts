import { useEffect } from 'react';
import { BackHandler } from 'react-native';

/**
 * Closes an in-screen overlay with the Android hardware back button while it is
 * open, instead of letting back navigate away from the screen behind it.
 *
 * Only for overlays drawn inside the screen — an absolutely positioned panel, a
 * card floating over the video. A real `Modal` receives back in its own Dialog
 * window and never reaches a `BackHandler` listener, so it wires the modal's
 * `onRequestClose` instead (see `AnimatedModal`).
 *
 * Listeners are LIFO, so the overlay registered last is the one back closes —
 * ahead of any handler the screen behind it registered earlier.
 */
export function useBackClose(active: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!active) return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });

    return () => subscription.remove();
  }, [active, onClose]);
}
