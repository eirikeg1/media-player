/**
 * Network connectivity utilities for video playback
 */

import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

export interface NetworkState {
  isConnected: boolean;
  type: string;
  isWifiEnabled: boolean;
  strength?: number;
}

function toNetworkState(netInfo: NetInfoState): NetworkState {
  return {
    isConnected: netInfo.isConnected ?? false,
    type: netInfo.type,
    isWifiEnabled: netInfo.type === 'wifi',
    strength:
      netInfo.details && 'strength' in netInfo.details
        ? (netInfo.details.strength as number)
        : undefined,
  };
}

/**
 * Check current network connectivity
 */
export async function checkNetworkConnectivity(): Promise<NetworkState> {
  try {
    return toNetworkState(await NetInfo.fetch());
  } catch (error) {
    console.warn('Failed to check network connectivity:', error);
    return {
      isConnected: false,
      type: 'unknown',
      isWifiEnabled: false,
    };
  }
}

/**
 * Subscribe to network state changes
 */
export function subscribeToNetworkChanges(callback: (state: NetworkState) => void) {
  return NetInfo.addEventListener((netInfo) => callback(toNetworkState(netInfo)));
}
