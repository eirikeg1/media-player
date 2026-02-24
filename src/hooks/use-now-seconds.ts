import { useSyncExternalStore } from 'react';

// ---------------------------------------------------------------------------
// Singleton 60-second timer shared by all subscribers.
// Auto-starts on first subscribe, auto-stops when all unsubscribe.
// ---------------------------------------------------------------------------

type Listener = () => void;

const listeners = new Set<Listener>();
let currentSeconds = Math.floor(Date.now() / 1000);
let intervalId: ReturnType<typeof setInterval> | null = null;

function tick() {
  currentSeconds = Math.floor(Date.now() / 1000);
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);

  // Start the interval when the first subscriber mounts
  if (listeners.size === 1) {
    currentSeconds = Math.floor(Date.now() / 1000);
    intervalId = setInterval(tick, 60_000);
  }

  return () => {
    listeners.delete(listener);

    // Stop the interval when the last subscriber unmounts
    if (listeners.size === 0 && intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
}

function getSnapshot(): number {
  return currentSeconds;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Returns the current epoch seconds, updating every ~60 seconds.
 * Only one timer exists regardless of how many components call this.
 */
export function useNowSeconds(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Returns whether a programme is currently airing.
 * Because `useSyncExternalStore` compares snapshots with `Object.is`,
 * components only re-render when the boolean *changes* (e.g. a programme
 * starts or stops airing), not on every tick.
 */
export function useIsCurrentlyAiring(start: number, stop: number): boolean {
  return useSyncExternalStore(
    subscribe,
    () => currentSeconds >= start && currentSeconds < stop,
    () => currentSeconds >= start && currentSeconds < stop
  );
}
