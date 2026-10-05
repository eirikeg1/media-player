import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { useLiveTick } from '../hooks/use-live-tick';

/**
 * Drives the app state the hook gates on. The react-native mock reports no
 * state of its own, so without this every tick would look backgrounded.
 * Returns a function that pushes a new state to the hook's listener.
 */
function mockAppState(initial: AppStateStatus): (next: AppStateStatus) => void {
  // `currentState` is a jest mock function in the react-native mock, so it can
  // only be redefined outright — `replaceProperty` refuses a function.
  Object.defineProperty(AppState, 'currentState', {
    configurable: true,
    value: initial,
  });
  const handlers: ((state: AppStateStatus) => void)[] = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
    handlers.push(handler as (state: AppStateStatus) => void);
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
  return (next) => handlers.forEach((handler) => handler(next));
}

let setAppState: (next: AppStateStatus) => void;

beforeEach(() => {
  jest.useFakeTimers();
  setAppState = mockAppState('active');
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('useLiveTick', () => {
  it('advances once per interval while enabled', async () => {
    const { result } = await renderHook(() => useLiveTick(true, 30_000));

    expect(result.current).toBe(0);

    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    expect(result.current).toBe(1);

    await act(async () => {
      jest.advanceTimersByTime(90_000);
    });
    expect(result.current).toBe(4);
  });

  it('holds no timer while disabled', async () => {
    const { result } = await renderHook(() => useLiveTick(false, 30_000));

    await act(async () => {
      jest.advanceTimersByTime(10 * 60_000);
    });

    expect(result.current).toBe(0);
  });

  it('stops ticking, and reports 0, once it is switched off', async () => {
    const { result, rerender } = await renderHook(
      ({ enabled }: { enabled: boolean }) => useLiveTick(enabled, 30_000),
      { initialProps: { enabled: true } }
    );

    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    expect(result.current).toBe(2);

    // A day whose last match has finished must not keep re-rendering its rows.
    await rerender({ enabled: false });
    expect(result.current).toBe(0);

    await act(async () => {
      jest.advanceTimersByTime(10 * 60_000);
    });
    expect(result.current).toBe(0);
  });

  it('stops while the app is in the background and resumes with it', async () => {
    const { result } = await renderHook(() => useLiveTick(true, 30_000));

    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    expect(result.current).toBe(1);

    // Nobody is reading the minute; a sheet left open must not re-render for
    // hours behind another app.
    await act(async () => {
      setAppState('background');
    });
    await act(async () => {
      jest.advanceTimersByTime(10 * 60_000);
    });
    expect(result.current).toBe(1);

    await act(async () => {
      setAppState('active');
    });
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    expect(result.current).toBe(2);
  });
});
