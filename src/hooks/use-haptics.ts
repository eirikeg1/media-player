import * as Haptics from 'expo-haptics';

/**
 * Fire-and-forget haptic feedback.
 *
 * `expo-haptics` rejects on devices without a vibrator and is a no-op on web, so
 * every call swallows its own failure: feedback is a garnish, and a missing
 * motor must never surface as an unhandled rejection.
 */
function fire(effect: () => Promise<void>): void {
  try {
    void effect().catch(() => {
      // No vibrator, or the OS declined — nothing to recover from.
    });
  } catch {
    // Unsupported platform (web): the module call itself throws.
  }
}

export interface HapticsApi {
  /** A tap landed on something. */
  light(): void;
  /** A value changed — a tab, a segment, a picker row. */
  selection(): void;
  /** The action completed. */
  success(): void;
  /** The action needs confirming, or was destructive. */
  warning(): void;
}

const haptics: HapticsApi = {
  light: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  selection: () => fire(() => Haptics.selectionAsync()),
  success: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
};

/**
 * The app's haptic vocabulary. Platform-neutral by design: Android and iOS both
 * have the hardware, so gating on `EXPO_OS === 'ios'` only made Android feel
 * dead. Effects that a platform cannot produce degrade to nothing.
 */
export function useHaptics(): HapticsApi {
  // A module-level singleton: stable across renders, so it is safe in a
  // `useCallback`/`useEffect` dependency list.
  return haptics;
}
