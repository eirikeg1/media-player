import { useVideoNetworkStore } from '@/stores/video/network-store';
import { useCallback, useEffect, useMemo } from 'react';
import {
    checkNetworkConnectivity,
    getNetworkErrorMessage,
    isNetworkSuitableForStreaming,
    subscribeToNetworkChanges
} from '../../utils/network-utils';

export function useVideoNetwork() {
  // Selected rather than subscribing to the whole store, so an unrelated write
  // doesn't re-render the player tree.
  const networkState = useVideoNetworkStore((s) => s.networkState);
  const isMonitoring = useVideoNetworkStore((s) => s.isMonitoring);
  const unsubscribe = useVideoNetworkStore((s) => s.unsubscribe);
  const setNetworkState = useVideoNetworkStore((s) => s.setNetworkState);
  const setIsMonitoring = useVideoNetworkStore((s) => s.setIsMonitoring);
  const setUnsubscribe = useVideoNetworkStore((s) => s.setUnsubscribe);

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