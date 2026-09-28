import { useSyncExternalStore } from 'react';

import {
  checkNetworkConnectivity,
  subscribeToNetworkChanges,
  type NetworkState,
} from '../../utils/network-utils';

// ---------------------------------------------------------------------------
// One NetInfo subscription shared by all subscribers, refcounted like
// `use-now-seconds`. A per-hook subscription stored in a Zustand store lost its
// unsubscribe function whenever a second consumer mounted, leaking the native
// listener for the rest of the app's life.
// ---------------------------------------------------------------------------

type Listener = () => void;

const listeners = new Set<Listener>();
let netInfoUnsubscribe: (() => void) | null = null;

let snapshot: NetworkState = {
  isConnected: true,
  type: 'unknown',
  isWifiEnabled: false,
};

function publish(next: NetworkState): void {
  if (
    next.isConnected === snapshot.isConnected &&
    next.type === snapshot.type &&
    next.isWifiEnabled === snapshot.isWifiEnabled &&
    next.strength === snapshot.strength
  ) {
    return;
  }
  snapshot = next;
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);

  if (listeners.size === 1) {
    netInfoUnsubscribe = subscribeToNetworkChanges(publish);
    void checkNetwork();
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      netInfoUnsubscribe?.();
      netInfoUnsubscribe = null;
    }
  };
}

function getSnapshot(): NetworkState {
  return snapshot;
}

/** Probe connectivity now, publishing the result to every subscriber. */
export async function checkNetwork(): Promise<NetworkState> {
  const state = await checkNetworkConnectivity();
  publish(state);
  return state;
}

/** The device's current network state, updated as it changes. */
export function useVideoNetwork(): NetworkState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
