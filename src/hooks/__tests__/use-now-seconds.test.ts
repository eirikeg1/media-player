import { act, renderHook } from '@testing-library/react-native';

import { useIsCurrentlyAiring, useNowSeconds } from '../use-now-seconds';

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-06-12T12:00:00Z'));
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useNowSeconds', () => {
  it('returns the current epoch seconds on mount', async () => {
    const { result } = await renderHook(() => useNowSeconds());

    expect(result.current).toBe(Math.floor(Date.now() / 1000));
  });

  it('updates once per minute', async () => {
    const { result } = await renderHook(() => useNowSeconds());
    const initial = result.current;

    await act(() => {
      jest.advanceTimersByTime(60_000);
    });

    expect(result.current).toBe(initial + 60);
  });

  it('does not tick before the minute has elapsed', async () => {
    const { result } = await renderHook(() => useNowSeconds());
    const initial = result.current;

    await act(() => {
      jest.advanceTimersByTime(59_000);
    });

    expect(result.current).toBe(initial);
  });

  it('stops the shared timer when the last subscriber unmounts', async () => {
    // React schedules its own timers, so track the hook's interval explicitly.
    const setIntervalSpy = jest.spyOn(globalThis, 'setInterval');
    const clearIntervalSpy = jest.spyOn(globalThis, 'clearInterval');

    const { unmount } = await renderHook(() => useNowSeconds());

    const tickCallIndex = setIntervalSpy.mock.calls.findIndex(([, delay]) => delay === 60_000);
    expect(tickCallIndex).not.toBe(-1);
    const intervalId = setIntervalSpy.mock.results[tickCallIndex].value;

    await unmount();

    expect(clearIntervalSpy).toHaveBeenCalledWith(intervalId);
  });
});

describe('useIsCurrentlyAiring', () => {
  it('is true while now is within [start, stop)', async () => {
    const now = Math.floor(Date.now() / 1000);
    const { result } = await renderHook(() => useIsCurrentlyAiring(now - 60, now + 120));

    expect(result.current).toBe(true);
  });

  it('is false before the programme starts', async () => {
    const now = Math.floor(Date.now() / 1000);
    const { result } = await renderHook(() => useIsCurrentlyAiring(now + 600, now + 1200));

    expect(result.current).toBe(false);
  });

  it('flips to false once the programme ends', async () => {
    const now = Math.floor(Date.now() / 1000);
    // Ends 30 seconds from now, so the first 60-second tick crosses the boundary
    const { result } = await renderHook(() => useIsCurrentlyAiring(now - 60, now + 30));

    expect(result.current).toBe(true);

    await act(() => {
      jest.advanceTimersByTime(60_000);
    });

    expect(result.current).toBe(false);
  });
});
