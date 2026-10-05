import { useCallback, useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';

/**
 * The slice of a route's navigation object this hook needs: React Navigation's
 * `beforeRemove`, which fires while the route is being taken off the stack.
 */
export interface RouteRemovalEvents {
  addListener(event: 'beforeRemove', listener: () => void): () => void;
}

export interface SessionExit {
  /**
   * Declare that the removal about to happen is a hand-over to another launch
   * of the same route, not a departure — so the session is left alone.
   */
  beginHandover: () => void;
}

/**
 * Run `leave` when the video route is removed from the stack: the on-screen back
 * pill, Android back, a `replace` out of the player, all of them.
 *
 * The route's own lifecycle rather than a `BackHandler`: one decision on removal
 * covers every way out of the screen instead of only the hardware button, and it
 * keeps working when back is a system gesture the screen cannot intercept.
 *
 * A hand-over (a catch-up window running into the live stream) replaces this
 * route with another launch of itself, which removes it too. The incoming screen
 * starts the session it needs, so `beginHandover` marks that case and the
 * outgoing one keeps its hands off the session.
 */
export function useSessionExit(
  navigation: RouteRemovalEvents,
  leave: () => void
): SessionExit {
  // Registered once per navigation object: the decision reads the current
  // `leave` through the ref, so re-rendering the screen never re-subscribes.
  const leaveRef = useRef(leave);
  leaveRef.current = leave;

  const isHandingOverRef = useRef(false);
  const beginHandover = useCallback(() => {
    isHandingOverRef.current = true;
  }, []);

  useEffect(
    () =>
      navigation.addListener('beforeRemove', () => {
        if (isHandingOverRef.current) return;
        leaveRef.current();
      }),
    [navigation]
  );

  return { beginHandover };
}

/**
 * Android back on a route with no history behind it.
 *
 * React Navigation's own back handler only pops when it can; with nothing to
 * pop it lets the press fall through to the activity, which finishes the app —
 * without the route ever being removed, so {@link useSessionExit} never runs and
 * the stream keeps the panel's only connection. A player opened cold (a deep
 * link, a notification) is exactly that route. The handler steps in only for
 * that case and returns `false` otherwise, so an ordinary pop still goes
 * through navigation and `beforeRemove`.
 */
export function useNoHistoryBack(canGoBack: () => boolean, exit: () => void): void {
  const canGoBackRef = useRef(canGoBack);
  canGoBackRef.current = canGoBack;
  const exitRef = useRef(exit);
  exitRef.current = exit;

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBackRef.current()) return false;
      exitRef.current();
      return true;
    });
    return () => subscription.remove();
  }, []);
}
