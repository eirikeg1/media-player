import { act, renderHook } from '@testing-library/react-native';
import { BackHandler } from 'react-native';

import { useBackClose } from '../use-back-close';

/** Drives the listeners `BackHandler.addEventListener` has been given, LIFO. */
function pressBack(): boolean {
  for (const listener of [...listeners].reverse()) {
    if (listener()) return true;
  }
  return false;
}

let listeners: (() => boolean)[] = [];

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

describe('useBackClose', () => {
  it('closes on back and stops the event there', async () => {
    const onClose = jest.fn();
    await renderHook(() => useBackClose(true, onClose));

    expect(pressBack()).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('registers nothing while inactive', async () => {
    const onClose = jest.fn();
    await renderHook(() => useBackClose(false, onClose));

    expect(pressBack()).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('registers and unregisters as it opens and closes', async () => {
    const onClose = jest.fn();
    const { rerender } = await renderHook(
      ({ active }: { active: boolean }) => useBackClose(active, onClose),
      { initialProps: { active: false } }
    );

    await act(() => rerender({ active: true }));
    expect(pressBack()).toBe(true);

    await act(() => rerender({ active: false }));
    expect(pressBack()).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes on unmount', async () => {
    const onClose = jest.fn();
    const { unmount } = await renderHook(() => useBackClose(true, onClose));

    await act(() => unmount());

    expect(pressBack()).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('lets the innermost overlay win, listeners being LIFO', async () => {
    const outer = jest.fn();
    const inner = jest.fn();
    await renderHook(() => useBackClose(true, outer));
    await renderHook(() => useBackClose(true, inner));

    expect(pressBack()).toBe(true);

    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });
});
