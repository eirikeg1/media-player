import { create } from 'zustand';

interface AppReadyState {
  // Whether the app has finished its startup work and the animated splash
  // loader is allowed to fade out, revealing the UI underneath.
  isReady: boolean;

  // Signal that startup is complete. Idempotent — safe to call from every
  // readiness source: the landing screen reporting itself populated (see
  // `features/launch/landing-readiness`), the redirect to user-select, an init
  // error, and the root layout's safety timeout.
  markReady: () => void;
}

/**
 * Central "app is ready, reveal the UI" signal.
 *
 * The animated splash overlay watches `isReady` and fades out when it flips
 * true. Various startup paths converge on `markReady()` so there is a single
 * source of truth for when the loading screen should dismiss.
 */
export const useAppReadyStore = create<AppReadyState>((set) => ({
  isReady: false,
  markReady: () => set({ isReady: true }),
}));
