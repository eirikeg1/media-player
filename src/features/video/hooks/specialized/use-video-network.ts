import { useVideoNetworkStore } from '@/states/video/network-store';
import { useCallback, useEffect, useMemo } from 'react';
import {
    checkNetworkConnectivity,
    getNetworkErrorMessage,
    isNetworkSuitableForStreaming,
    subscribeToNetworkChanges
} from '../../utils/network-utils';

export function useVideoNetwork() {
  const {
    networkState,
    isMonitoring,
    unsubscribe,
    setNetworkState,
    setIsMonitoring,
    setUnsubscribe,
  } = useVideoNetworkStore();

  const checkNetwork = useCallback(async () => {
    try {
      const network = await checkNetworkConnectivity();
      setNetworkState(network);
      return network;
    } catch (error) {
      console.warn('Failed to check network connectivity:', error);
      return useVideoNetworkStore.getState().networkState; // Return current state if check fails
    }
  }, [setNetworkState]);

  const startNetworkMonitoring = useCallback(() => {
    if (isMonitoring) return;

    const unsubscribeFn = subscribeToNetworkChanges((newNetworkState) => {
      setNetworkState(newNetworkState);
    });

    setUnsubscribe(unsubscribeFn);
    setIsMonitoring(true);

    // Check initial network state
    checkNetwork();
  }, [isMonitoring, setNetworkState, setUnsubscribe, setIsMonitoring, checkNetwork]);

  const stopNetworkMonitoring = useCallback(() => {
    if (unsubscribe) {
      unsubscribe();
      setUnsubscribe(null);
    }
    setIsMonitoring(false);
  }, [unsubscribe, setUnsubscribe, setIsMonitoring]);

  const isNetworkSuitable = useCallback(() => {
    return isNetworkSuitableForStreaming(networkState);
  }, [networkState]);

  const getNetworkError = useCallback(() => {
    return getNetworkErrorMessage(networkState);
  }, [networkState]);

  // Auto-start monitoring on mount
  useEffect(() => {
    if (isMonitoring) return;

    const unsubscribeFn = subscribeToNetworkChanges((newNetworkState) => {
      setNetworkState(newNetworkState);
    });

    setUnsubscribe(unsubscribeFn);
    setIsMonitoring(true);

    // Check initial network state
    checkNetworkConnectivity().then(setNetworkState).catch(console.warn);

    return () => {
      if (unsubscribeFn) {
        unsubscribeFn();
      }
      setUnsubscribe(null);
      setIsMonitoring(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only run on mount/unmount. Zustand setters are stable.

  const actions = useMemo(() => ({
    checkNetwork,
    startNetworkMonitoring,
    stopNetworkMonitoring,
  }), [checkNetwork, startNetworkMonitoring, stopNetworkMonitoring]);

  return useMemo(() => ({
    networkState,
    isMonitoring,
    isNetworkSuitable: isNetworkSuitable(),
    networkError: getNetworkError(),
    actions,
  }), [
    networkState,
    isMonitoring,
    isNetworkSuitable,
    getNetworkError,
    actions,
  ]);
}