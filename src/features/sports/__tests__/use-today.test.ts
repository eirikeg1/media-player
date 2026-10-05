import { act, renderHook } from '@testing-library/react-native';

import { localDateKey } from '../date-utils';
import { useToday } from '../hooks/use-today';

/** Late enough that "tomorrow" is a few hours away in any timezone. */
const EVENING = new Date('2026-06-12T20:30:00Z');

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(EVENING);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useToday', () => {
  it('starts on the local midnight of today', async () => {
    const { result } = await renderHook(() => useToday());

    expect(localDateKey(result.current)).toBe(localDateKey(EVENING));
    expect(result.current.getHours()).toBe(0);
  });

  it('keeps the same value while the day lasts', async () => {
    const { result } = await renderHook(() => useToday());
    const first = result.current;

    await act(async () => {
      jest.advanceTimersByTime(60 * 60_000);
    });

    // Identity matters: callers depend on it directly to arm their polls.
    expect(result.current).toBe(first);
  });

  it('rolls over at the next local midnight', async () => {
    const { result } = await renderHook(() => useToday());
    const first = result.current;

    await act(async () => {
      jest.advanceTimersByTime(24 * 60 * 60_000);
    });

    expect(result.current).not.toBe(first);
    expect(result.current.getTime()).toBeGreaterThan(first.getTime());
    expect(result.current.getHours()).toBe(0);
  });
});
