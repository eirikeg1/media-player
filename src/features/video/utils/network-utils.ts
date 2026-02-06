/**
 * Network connectivity utilities for video playback
 */

import NetInfo from '@react-native-community/netinfo';

export interface NetworkState {
  isConnected: boolean;
  type: string;
  isWifiEnabled: boolean;
  strength?: number;
}

/**
 * Check current network connectivity
 */
export async function checkNetworkConnectivity(): Promise<NetworkState> {
  try {
    const netInfo = await NetInfo.fetch();

    return {
      isConnected: netInfo.isConnected ?? false,
      type: netInfo.type,
      isWifiEnabled: netInfo.type === 'wifi',
      strength: netInfo.details && 'strength' in netInfo.details ? netInfo.details.strength as number : undefined,
    };
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
  return NetInfo.addEventListener((netInfo) => {
    callback({
      isConnected: netInfo.isConnected ?? false,
      type: netInfo.type,
      isWifiEnabled: netInfo.type === 'wifi',
      strength: netInfo.details && 'strength' in netInfo.details ? netInfo.details.strength as number : undefined,
    });
  });
}

/**
 * Check if network conditions are suitable for video streaming
 */
export function isNetworkSuitableForStreaming(networkState: NetworkState): boolean {
  if (!networkState.isConnected) {
    return false;
  }

  // WiFi is generally good for streaming
  if (networkState.isWifiEnabled) {
    return true;
  }

  // For cellular, check signal strength if available
  if (networkState.strength !== undefined) {
    return networkState.strength > 2; // Require decent signal strength
  }

  // If we can't determine strength, assume it's okay if connected
  return true;
}

/**
 * Get network-related error message
 */
export function getNetworkErrorMessage(networkState: NetworkState): string {
  if (!networkState.isConnected) {
    return 'No internet connection available';
  }

  if (networkState.type === 'cellular' && networkState.strength !== undefined && networkState.strength <= 2) {
    return 'Weak cellular signal may affect video quality';
  }

  return '';
}