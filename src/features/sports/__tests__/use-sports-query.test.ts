import { getSportsDatabase } from '@/services/sports-service';
import { resetSportsCacheEpoch } from '@/test/helpers';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { SportsDatabase } from 'expo-m3u-parser';
import { AppState, type AppStateStatus } from 'react-native';

import { useSportsQuery, type SportsQueryContext } from '../hooks/use-sports-query';
import { bumpSportsCacheEpoch } from '../sports-cache-epoch';

const FALLBACK = "Couldn't load it.";

/** A promise the test settles by hand, to hold a load in flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Drives the app state the poll gates on. The react-native mock reports no
 * state of its own, so without this every query would look backgrounded.
 */
function mockAppState(initial: AppStateStatus): (next: AppStateStatus) => void {
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: initial });
  const handlers: ((state: AppStateStatus) => void)[] = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
    handlers.push(handler as (state: AppStateStatus) => void);
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
  return (next) => handlers.forEach((handler) => handler(next));
}

let setAppState: (next: AppStateStatus) => void;

beforeEach(async () => {
  resetSportsCacheEpoch();
  setAppState = mockAppState('active');
  await getSportsDatabase();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useSportsQuery', () => {
  it('reports loading from the first frame until something answers', async () => {
    const pending = deferred<string>();

    const { result } = await renderHook(() =>
      useSportsQuery<number, string>({ key: 1, fetcher: () => pending.promise, fallback: FALLBACK })
    );

    // Derived by the hook itself rather than written by the fetch effect: the
    // first frame of a section has to show its skeleton, not its empty state.
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();

    pending.resolve('one');
    await waitFor(() => expect(result.current.data).toBe('one'));
    expect(result.current.isLoading).toBe(false);
  });

  it('never runs while disabled, and loads once enabled', async () => {
    const fetcher = jest.fn(async () => 'one');

    const { result, rerender } = await renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useSportsQuery<number, string>({ key: 1, enabled, fetcher, fallback: FALLBACK }),
      { initialProps: { enabled: false } }
    );

    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);

    await rerender({ enabled: true });
    await waitFor(() => expect(result.current.data).toBe('one'));

    // Disabling is a visibility gate, not a mount gate: what was loaded stays,
    // and coming back to the tab does not pay for it again.
    await rerender({ enabled: false });
    expect(result.current.data).toBe('one');
    await rerender({ enabled: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('asks for nothing while the key is null', async () => {
    const fetcher = jest.fn(async () => 'one');

    const { result } = await renderHook(() =>
      useSportsQuery<number, string>({ key: null, fetcher, fallback: FALLBACK })
    );

    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it('drops the previous key before the new one answers', async () => {
    const pending = deferred<string>();
    const fetcher = jest.fn((_db: SportsDatabase, key: number) =>
      key === 1 ? Promise.resolve('one') : pending.promise
    );

    const { result, rerender } = await renderHook(
      ({ key }: { key: number }) =>
        useSportsQuery<number, string>({ key, fetcher, fallback: FALLBACK }),
      { initialProps: { key: 1 } }
    );
    await waitFor(() => expect(result.current.data).toBe('one'));

    await rerender({ key: 2 });

    // Key 1's answer under key 2's heading is worse than no answer at all.
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(true);

    pending.resolve('two');
    await waitFor(() => expect(result.current.data).toBe('two'));
  });

  it('drops an answer its own request was superseded by', async () => {
    const first = deferred<string>();
    const fetcher = jest.fn((_db: SportsDatabase, key: number) =>
      key === 1 ? first.promise : Promise.resolve('two')
    );

    const { result, rerender } = await renderHook(
      ({ key }: { key: number }) =>
        useSportsQuery<number, string>({ key, fetcher, fallback: FALLBACK }),
      { initialProps: { key: 1 } }
    );

    await rerender({ key: 2 });
    await waitFor(() => expect(result.current.data).toBe('two'));

    // The slow read for the key the user left lands last but must not win.
    await act(async () => {
      first.resolve('one');
    });
    expect(result.current.data).toBe('two');
  });

  it('publishes an intermediate result without ending the load', async () => {
    const authoritative = deferred<string>();
    const fetcher = async (
      _db: SportsDatabase,
      _key: number,
      { publish }: SportsQueryContext<string>
    ) => {
      publish('cached');
      return authoritative.promise;
    };

    const { result } = await renderHook(() =>
      useSportsQuery<number, string>({ key: 1, fetcher, fallback: FALLBACK })
    );

    // The cached answer is on screen, so the user browses it instead of a
    // spinner while the authoritative read is still out.
    await waitFor(() => expect(result.current.data).toBe('cached'));
    expect(result.current.isLoading).toBe(false);

    authoritative.resolve('fresh');
    await waitFor(() => expect(result.current.data).toBe('fresh'));
  });

  it('adopts data the caller already has, without asking for it', async () => {
    const fetcher = jest.fn(async () => 'fetched');

    const { result } = await renderHook(() =>
      useSportsQuery<number, string>({
        key: 1,
        fetcher,
        fallback: FALLBACK,
        initialData: () => 'seeded',
      })
    );

    expect(result.current.data).toBe('seeded');
    expect(result.current.isLoading).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('keeps the previous value when a new result is interchangeable', async () => {
    const results = ['a', 'a', 'b'];
    let call = 0;
    const fetcher = async () => ({ value: results[call++] });

    const { result } = await renderHook(() =>
      useSportsQuery<number, { value: string }>({
        key: 1,
        fetcher,
        fallback: FALLBACK,
        isEqual: (a, b) => a.value === b.value,
      })
    );
    await waitFor(() => expect(result.current.data?.value).toBe('a'));
    const loaded = result.current.data;

    await act(async () => {
      await result.current.refresh();
    });
    // Identical data must keep its identity, or every memoised row below
    // re-renders for an unchanged value.
    expect(result.current.data).toBe(loaded);

    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.data).not.toBe(loaded);
    expect(result.current.data?.value).toBe('b');
  });

  it('names the failure through the sports error copy', async () => {
    const { result } = await renderHook(() =>
      useSportsQuery<number, string>({
        key: 1,
        fetcher: async () => {
          throw new Error('FfiException: sqlite busy');
        },
        fallback: FALLBACK,
      })
    );

    await waitFor(() => expect(result.current.error).toBe(FALLBACK));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it('recognises a coded failure over the fallback', async () => {
    const { result } = await renderHook(() =>
      useSportsQuery<number, string>({
        key: 1,
        fetcher: async () => {
          throw Object.assign(new Error('403'), { code: 'BLOCKED' });
        },
        fallback: FALLBACK,
      })
    );

    await waitFor(() =>
      expect(result.current.error).toBe(
        'The score provider is refusing requests right now — try again later.'
      )
    );
  });

  it('clears the error and retries on refresh', async () => {
    let fail = true;
    const fetcher = async () => {
      if (fail) throw new Error('provider down');
      return 'one';
    };

    const { result } = await renderHook(() =>
      useSportsQuery<number, string>({ key: 1, fetcher, fallback: FALLBACK })
    );
    await waitFor(() => expect(result.current.error).toBe(FALLBACK));

    fail = false;
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.data).toBe('one');
  });

  it('passes force through to the fetcher', async () => {
    const fetcher = jest.fn(
      async (_db: SportsDatabase, _key: number, ctx: SportsQueryContext<string>) =>
        ctx.force ? 'fresh' : 'cached'
    );

    const { result } = await renderHook(() =>
      useSportsQuery<number, string>({ key: 1, fetcher, fallback: FALLBACK })
    );
    await waitFor(() => expect(result.current.data).toBe('cached'));

    await act(async () => {
      await result.current.refresh({ force: true });
    });
    expect(result.current.data).toBe('fresh');
  });

  it('writes data directly, for an optimistic update the caller can undo', async () => {
    const { result } = await renderHook(() =>
      useSportsQuery<number, string[]>({
        key: 1,
        fetcher: async () => ['a', 'b'],
        fallback: FALLBACK,
      })
    );
    await waitFor(() => expect(result.current.data).toEqual(['a', 'b']));

    await act(async () => {
      result.current.setData(['a']);
    });
    expect(result.current.data).toEqual(['a']);

    await act(async () => {
      result.current.setData((previous) => [...(previous ?? []), 'b']);
    });
    expect(result.current.data).toEqual(['a', 'b']);
  });

  describe('polling', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('refreshes on the interval, silently', async () => {
      let call = 0;
      const fetcher = jest.fn(async () => `v${++call}`);

      const { result } = await renderHook(() =>
        useSportsQuery<number, string>({ key: 1, fetcher, fallback: FALLBACK, pollMs: 60_000 })
      );
      await waitFor(() => expect(result.current.data).toBe('v1'));

      await act(async () => {
        jest.advanceTimersByTime(60_000);
      });
      await waitFor(() => expect(result.current.data).toBe('v2'));
      // A poll never blanks the screen it is refreshing.
      expect(result.current.isLoading).toBe(false);
    });

    it('holds no timer while the app is backgrounded, and catches up on return', async () => {
      const fetcher = jest.fn(async () => 'one');

      const { result } = await renderHook(() =>
        useSportsQuery<number, string>({ key: 1, fetcher, fallback: FALLBACK, pollMs: 60_000 })
      );
      await waitFor(() => expect(result.current.data).toBe('one'));
      expect(fetcher).toHaveBeenCalledTimes(1);

      await act(async () => {
        setAppState('background');
      });
      await act(async () => {
        jest.advanceTimersByTime(10 * 60_000);
      });
      // A sheet left open over a background spell is not a reason to request.
      expect(fetcher).toHaveBeenCalledTimes(1);

      // What is on screen is as old as the absence, so it catches up at once
      // rather than waiting out a full interval.
      await act(async () => {
        setAppState('active');
      });
      await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    });

    it('keeps the data and the error a silent poll fails on', async () => {
      let fail = false;
      const fetcher = jest.fn(async () => {
        if (fail) throw new Error('provider down');
        return 'one';
      });

      const { result } = await renderHook(() =>
        useSportsQuery<number, string>({ key: 1, fetcher, fallback: FALLBACK, pollMs: 60_000 })
      );
      await waitFor(() => expect(result.current.data).toBe('one'));

      fail = true;
      await act(async () => {
        jest.advanceTimersByTime(60_000);
      });
      await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));

      // The rows the user is reading are still the best answer available, and
      // an error banner for a refresh nobody asked for is noise.
      expect(result.current.data).toBe('one');
      expect(result.current.error).toBeNull();
    });

    it('reports a silent failure that leaves nothing on screen', async () => {
      let fail = false;
      const fetcher = jest.fn(async () => {
        if (fail) throw new Error('provider down');
        return 'one';
      });

      const { result } = await renderHook(() =>
        useSportsQuery<number, string>({ key: 1, fetcher, fallback: FALLBACK, pollMs: 60_000 })
      );
      await waitFor(() => expect(result.current.data).toBe('one'));

      // The caller took its data back (an optimistic update it undid), so the
      // poll below has nothing left to protect.
      await act(async () => {
        result.current.setData(() => undefined);
      });
      expect(result.current.isLoading).toBe(true);

      fail = true;
      await act(async () => {
        jest.advanceTimersByTime(60_000);
      });

      // Staying quiet here left the skeleton up for the rest of the session:
      // nothing else ever clears a loading state that has no data to end it.
      await waitFor(() => expect(result.current.error).toBe(FALLBACK));
      expect(result.current.isLoading).toBe(false);
    });

    it('holds no timer at all without a poll interval', async () => {
      const fetcher = jest.fn(async () => 'one');

      const { result } = await renderHook(() =>
        useSportsQuery<number, string>({ key: 1, fetcher, fallback: FALLBACK })
      );
      await waitFor(() => expect(result.current.data).toBe('one'));

      await act(async () => {
        jest.advanceTimersByTime(60 * 60_000);
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
    });
  });

  describe('cache invalidation', () => {
    it('reloads silently behind the data already on screen', async () => {
      let call = 0;
      const pending = deferred<string>();
      const fetcher = jest.fn(async () => (++call === 1 ? 'first' : pending.promise));

      const { result } = await renderHook(() =>
        useSportsQuery<number, string>({ key: 1, fetcher, fallback: FALLBACK })
      );
      await waitFor(() => expect(result.current.data).toBe('first'));

      await act(async () => {
        bumpSportsCacheEpoch();
      });
      await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));

      // Silent: the rows the user is reading stay until the replacement lands.
      expect(result.current.data).toBe('first');
      expect(result.current.isLoading).toBe(false);

      pending.resolve('second');
      await waitFor(() => expect(result.current.data).toBe('second'));
    });

    it('leaves the data alone when the reload behind it fails', async () => {
      let call = 0;
      const fetcher = jest.fn(async () => {
        if (++call === 1) return 'first';
        throw new Error('provider down');
      });

      const { result } = await renderHook(() =>
        useSportsQuery<number, string>({ key: 1, fetcher, fallback: FALLBACK })
      );
      await waitFor(() => expect(result.current.data).toBe('first'));

      await act(async () => {
        bumpSportsCacheEpoch();
      });
      await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));

      expect(result.current.data).toBe('first');
      expect(result.current.error).toBeNull();
    });
  });
});
