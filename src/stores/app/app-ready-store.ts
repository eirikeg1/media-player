import { create } from 'zustand';

interface AppReadyState {
  // Whether the app has finished its startup work and the animated splash
  // loader is allowed to fade out, revealing the UI underneath.
  isReady: boolean;

  // Signal that startup is complete. Idempotent — safe to call from multiple
  // readiness sources (home content ready, redirect, init error, safety timeout).
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
