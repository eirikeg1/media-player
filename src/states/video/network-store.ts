import type { NetworkState } from '@/components/domain/video/utils/network-utils';
import { create } from 'zustand';

interface VideoNetworkState {
  // Network state
  networkState: NetworkState;

  // Network monitoring
  isMonitoring: boolean;
  unsubscribe: (() => void) | null;

  // Actions
  setNetworkState: (networkState: NetworkState) => void;
  setIsMonitoring: (monitoring: boolean) => void;
  setUnsubscribe: (unsubscribe: (() => void) | null) => void;
  reset: () => void;
}

const initialNetworkState: NetworkState = {
  isConnected: true,
  type: 'unknown',
  isWifiEnabled: false,
};

const initialState = {
  networkState: initialNetworkState,
  isMonitoring: false,
  unsubscribe: null,
};

export const useVideoNetworkStore = create<VideoNetworkState>((set, get) => ({
  ...initialState,

  setNetworkState: (networkState) => set({ networkState }),

  setIsMonitoring: (isMonitoring) => set({ isMonitoring }),

  setUnsubscribe: (unsubscribe) => set({ unsubscribe }),

  reset: () => {
    const state = get();
    // Clean up any existing subscription
    if (state.unsubscribe) {
      state.unsubscribe();
    }
    set(initialState);
  },
}));