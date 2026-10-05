import { act, renderHook } from '@testing-library/react-native';

import { BackHandler } from 'react-native';

import { useNoHistoryBack, useSessionExit, type RouteRemovalEvents } from '../use-session-exit';

/**
 * A navigation object whose `beforeRemove` a test can fire.
 *
 * Firing it — like marking a hand-over — touches no React state, so neither is
 * wrapped in `act`: an `act` call left unawaited keeps React's act queue open
 * and the next test's effects never flush.
 */
function fakeNavigation() {
  let listeners: (() => void)[] = [];
  const navigation: RouteRemovalEvents = {
    addListener: (_event, listener) => {
      listeners.push(listener);
      return () => {
        listeners = listeners.filter((entry) => entry !== listener);
      };
    },
  };
  return {
    navigation,
    removeRoute: () => listeners.forEach((listener) => listener()),
    get listenerCount() {
      return listeners.length;
    },
  };
}

describe('useSessionExit', () => {
  it('leaves the session when the route is removed', async () => {
    const leave = jest.fn();
    const nav = fakeNavigation();
    await renderHook(() => useSessionExit(nav.navigation, leave));

    nav.removeRoute();

    expect(leave).toHaveBeenCalledTimes(1);
  });

  it('runs the latest decision, without re-subscribing', async () => {
    const first = jest.fn();
    const second = jest.fn();
    const nav = fakeNavigation();
    const { rerender } = await renderHook(
      ({ leave }: { leave: () => void }) => useSessionExit(nav.navigation, leave),
      { initialProps: { leave: first } }
    );

    await act(() => rerender({ leave: second }));
    nav.removeRoute();

    expect(nav.listenerCount).toBe(1);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('leaves the session alone on a hand-over to another launch of the route', async () => {
    const leave = jest.fn();
    const nav = fakeNavigation();
    const { result } = await renderHook(() => useSessionExit(nav.navigation, leave));

    result.current.beginHandover();
    nav.removeRoute();

    expect(leave).not.toHaveBeenCalled();
  });

  it('unsubscribes on unmount', async () => {
    const leave = jest.fn();
    const nav = fakeNavigation();
    const { unmount } = await renderHook(() => useSessionExit(nav.navigation, leave));

    await act(() => unmount());
    nav.removeRoute();

    expect(nav.listenerCount).toBe(0);
    expect(leave).not.toHaveBeenCalled();
  });
});

describe('useNoHistoryBack', () => {
  // Same harness as `use-back-close.test.ts`: the registered listeners are
  // driven LIFO, and the press is claimed when one of them returns true.
  let listeners: (() => boolean)[] = [];
  const pressBack = () => [...listeners].reverse().some((listener) => listener());

  beforeEach(() => {
    listeners = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, listener) => {
      listeners.push(listener as () => boolean);
      return {
        remove: () => {
          listeners = listeners.filter((entry) => entry !== listener);
        },
      };
    });
  });

  it('exits and claims the press when there is nothing to pop', async () => {
    const exit = jest.fn();
    await renderHook(() => useNoHistoryBack(() => false, exit));

    expect(pressBack()).toBe(true);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('lets navigation pop the route when it can', async () => {
    const exit = jest.fn();
    await renderHook(() => useNoHistoryBack(() => true, exit));

    expect(pressBack()).toBe(false);
    expect(exit).not.toHaveBeenCalled();
  });

  it('reads the latest answer without re-subscribing', async () => {
    const exit = jest.fn();
    let canGoBack = true;
    const { rerender } = await renderHook(() => useNoHistoryBack(() => canGoBack, exit));

    canGoBack = false;
    await act(() => rerender(undefined));
    pressBack();

    expect(listeners).toHaveLength(1);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('stops listening on unmount', async () => {
    const exit = jest.fn();
    const { unmount } = await renderHook(() => useNoHistoryBack(() => false, exit));

    await act(() => unmount());

    expect(pressBack()).toBe(false);
    expect(exit).not.toHaveBeenCalled();
  });
});
