import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

/**
 * The current app state as React state, so a screen can stop its polling while
 * the app is in the background.
 *
 * `AppState.currentState` is read again once the listener is attached: the app
 * can have changed state between the first render and the subscription, and
 * that transition would otherwise never be reported.
 */
export function useAppState(): AppStateStatus {
  const [appState, setAppState] = useState<AppStateStatus>(() => AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    setAppState(AppState.currentState);
    return () => subscription.remove();
  }, []);

  return appState;
}
