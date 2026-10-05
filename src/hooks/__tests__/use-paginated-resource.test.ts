import { act, renderHook, waitFor } from '@testing-library/react-native';

import {
  usePaginatedResource,
  type PaginatedFilters,
  type PaginatedPage,
  type PaginatedResourceCache,
} from '../use-paginated-resource';

interface Item {
  id: string;
}

function items(...ids: string[]): Item[] {
  return ids.map((id) => ({ id }));
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface Recorded {
  offset: number;
  filters: PaginatedFilters;
  deferred: Deferred<PaginatedPage<Item>>;
}

/** A `fetchPage` whose every call is resolved by the test, in order. */
function controlledFetch() {
  const calls: Recorded[] = [];
  const fetchPage = (offset: number, filters: PaginatedFilters) => {
    const call: Recorded = { offset, filters, deferred: deferred<PaginatedPage<Item>>() };
    calls.push(call);
    return call.deferred.promise;
  };
  return { calls, fetchPage };
}

/** Settles one recorded call and lets React flush the resulting state. */
async function settle(call: Recorded, page: PaginatedPage<Item>) {
  await act(async () => {
    call.deferred.resolve(page);
    await call.deferred.promise;
  });
}

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('usePaginatedResource', () => {
  it('discards an in-flight page when refresh() restarts the query', async () => {
    const { calls, fetchPage } = controlledFetch();

    const { result } = await renderHook(() =>
      usePaginatedResource<Item>({
        playlistId: 'p1',
        pageSize: 2,
        fetchPage,
        label: 'test',
      })
    );

    await settle(calls[0], { items: items('a', 'b'), totalCount: 4 });
    expect(result.current.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(result.current.hasMore).toBe(true);

    await act(async () => result.current.loadMore());
    expect(calls).toHaveLength(2);
    expect(calls[1].offset).toBe(2);

    // Refresh while page two is still in flight. The old fetch must be dropped
    // and the guard released so the new first-page fetch can actually start.
    await act(async () => result.current.refresh());
    expect(calls).toHaveLength(3);
    expect(calls[2].offset).toBe(0);

    await settle(calls[1], { items: items('stale'), totalCount: 4 });
    await settle(calls[2], { items: items('x', 'y'), totalCount: 2 });

    expect(result.current.items.map((i) => i.id)).toEqual(['x', 'y']);
    expect(result.current.hasMore).toBe(false);
  });

  it('clears isLoadingMore even when the loadMore it belongs to was superseded', async () => {
    const { calls, fetchPage } = controlledFetch();

    const { result } = await renderHook(() =>
      usePaginatedResource<Item>({
        playlistId: 'p1',
        pageSize: 2,
        fetchPage,
        label: 'test',
      })
    );

    await settle(calls[0], { items: items('a', 'b'), totalCount: 6 });
    await act(async () => result.current.loadMore());
    expect(result.current.isLoadingMore).toBe(true);

    await act(async () => result.current.refresh());
    await settle(calls[1], { items: items('stale'), totalCount: 6 });

    // Left stuck, infinite scroll would be dead for the rest of the session.
    expect(result.current.isLoadingMore).toBe(false);

    await settle(calls[2], { items: items('x', 'y'), totalCount: 6 });
    await act(async () => result.current.loadMore());
    expect(calls).toHaveLength(4);
    expect(calls[3].offset).toBe(2);
  });

  it('keeps reading as loading when a superseded fetch settles', async () => {
    const { calls, fetchPage } = controlledFetch();

    const { result, rerender } = await renderHook(
      ({ groups }: { groups: string[] }) =>
        usePaginatedResource<Item>({
          playlistId: 'p1',
          pageSize: 2,
          groups,
          fetchPage,
          label: 'test',
        }),
      { initialProps: { groups: ['A'] } }
    );

    await settle(calls[0], { items: items('a'), totalCount: 1 });
    expect(result.current.isLoading).toBe(false);

    // Two filter changes in quick succession: the second supersedes the first.
    await act(async () => rerender({ groups: ['B'] }));
    await act(async () => rerender({ groups: ['C'] }));
    expect(calls).toHaveLength(3);

    await settle(calls[1], { items: items('b'), totalCount: 1 });

    // The abandoned fetch must not announce "loaded" over the empty list its
    // replacement is still filling — that is the "No channels" flash mid-load.
    expect(result.current.items).toEqual([]);
    expect(result.current.isLoading).toBe(true);

    await settle(calls[2], { items: items('c'), totalCount: 1 });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.items.map((i) => i.id)).toEqual(['c']);
  });

  it('keeps the loaded items on screen while refresh() re-fetches', async () => {
    const { calls, fetchPage } = controlledFetch();

    const { result } = await renderHook(() =>
      usePaginatedResource<Item>({
        playlistId: 'p1',
        pageSize: 2,
        fetchPage,
        label: 'test',
      })
    );

    await settle(calls[0], { items: items('a', 'b'), totalCount: 4 });

    await act(async () => result.current.refresh());

    // Blanking the list first dropped the grid back to its skeleton on every
    // pull-to-refresh; the spinner is `isRefreshing`, not `isLoading`.
    expect(result.current.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(result.current.isRefreshing).toBe(true);
    expect(result.current.isLoading).toBe(false);

    await settle(calls[1], { items: items('x', 'y'), totalCount: 2 });
    expect(result.current.items.map((i) => i.id)).toEqual(['x', 'y']);
    expect(result.current.isRefreshing).toBe(false);
  });

  it('parks a deferred query without fetching, and clears rows of another one', async () => {
    const { calls, fetchPage } = controlledFetch();

    const { result, rerender } = await renderHook(
      ({ deferNetworkFetch, groups }: { deferNetworkFetch: boolean; groups?: string[] }) =>
        usePaginatedResource<Item>({
          playlistId: 'p1',
          pageSize: 2,
          groups,
          deferNetworkFetch,
          fetchPage,
          label: 'test',
        }),
      { initialProps: { deferNetworkFetch: false, groups: undefined as string[] | undefined } }
    );

    await settle(calls[0], { items: items('a', 'b'), totalCount: 6 });

    // Parked on the query it already answered (the inactive half of a tab):
    // what is on screen stays, and nothing may be fetched for it.
    await act(async () => rerender({ deferNetworkFetch: true, groups: undefined }));
    expect(result.current.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(result.current.isLoading).toBe(false);

    await act(async () => result.current.loadMore());
    expect(calls).toHaveLength(1);

    // Deferred onto a *different* query: the loaded rows answer the old filter,
    // so they go and the screen reads as loading until the tab is live.
    await act(async () => rerender({ deferNetworkFetch: true, groups: ['Sports'] }));
    expect(result.current.items).toEqual([]);
    expect(result.current.isLoading).toBe(true);
    expect(calls).toHaveLength(1);

    await act(async () => rerender({ deferNetworkFetch: false, groups: ['Sports'] }));
    expect(calls).toHaveLength(2);
    expect(calls[1].filters.groups).toEqual(['Sports']);
  });

  it('pages with the favourite ids the query generation started with', async () => {
    const { calls, fetchPage } = controlledFetch();

    const { result, rerender } = await renderHook(
      ({ favoriteIds }: { favoriteIds: string[] }) =>
        usePaginatedResource<Item>({
          playlistId: 'p1',
          pageSize: 2,
          favoriteIds,
          fetchPage,
          label: 'test',
        }),
      { initialProps: { favoriteIds: ['first'] } }
    );

    await settle(calls[0], { items: items('a', 'b'), totalCount: 6 });
    expect(calls[0].filters.favoriteIds).toEqual(['first']);

    // Starring a channel mid-scroll must not re-order the server result between
    // pages, or rows get skipped and duplicated.
    await act(async () => rerender({ favoriteIds: ['first', 'second'] }));
    await act(async () => result.current.loadMore());

    expect(calls[1].filters.favoriteIds).toEqual(['first']);

    // A deliberate refresh is where the new ordering takes effect.
    await act(async () => result.current.refresh());
    expect(calls[2].filters.favoriteIds).toEqual(['first', 'second']);
  });

  it('surfaces the error and retries the failed first page', async () => {
    const { calls, fetchPage } = controlledFetch();

    const { result } = await renderHook(() =>
      usePaginatedResource<Item>({
        playlistId: 'p1',
        pageSize: 2,
        fetchPage,
        label: 'test',
      })
    );

    await act(async () => {
      calls[0].deferred.reject(new Error('database is locked'));
      await calls[0].deferred.promise.catch(() => undefined);
    });

    expect(result.current.error).toBe('database is locked');
    expect(result.current.isLoading).toBe(false);

    await act(async () => result.current.retry());
    expect(calls).toHaveLength(2);

    await settle(calls[1], { items: items('a'), totalCount: 1 });
    expect(result.current.error).toBeNull();
    expect(result.current.items.map((i) => i.id)).toEqual(['a']);
  });

  describe('first-page cache', () => {
    function buildCache(overrides: Partial<PaginatedResourceCache<Item>> = {}) {
      const read = jest.fn(() => ({ items: items('cached'), totalCount: 10 }));
      const write = jest.fn();
      const cache: PaginatedResourceCache<Item> = {
        pageSize: 2,
        sortBy: 'title',
        sortOrder: 'asc',
        read,
        write,
        ...overrides,
      };
      return { cache, read, write };
    }

    it('renders the cached page and revalidates when the query matches the slot', async () => {
      const { calls, fetchPage } = controlledFetch();
      const { cache, read, write } = buildCache();

      const { result } = await renderHook(() =>
        usePaginatedResource<Item, 'title'>({
          playlistId: 'p1',
          pageSize: 2,
          sortBy: 'title',
          fetchPage,
          cache,
          label: 'test',
        })
      );

      expect(read).toHaveBeenCalled();
      expect(result.current.items.map((i) => i.id)).toEqual(['cached']);

      await settle(calls[0], { items: items('fresh'), totalCount: 10 });
      expect(write).toHaveBeenCalledWith({ items: items('fresh'), totalCount: 10 });
    });

    it('ignores the slot when paging at a different page size', async () => {
      const { calls, fetchPage } = controlledFetch();
      const { cache, read, write } = buildCache();

      await renderHook(() =>
        usePaginatedResource<Item, 'title'>({
          // The guide pages 50 at a time against a slot holding 100 — writing
          // its short page would truncate the slot for the grid.
          playlistId: 'p1',
          pageSize: 5,
          sortBy: 'title',
          fetchPage,
          cache,
          label: 'test',
        })
      );

      expect(read).not.toHaveBeenCalled();

      await settle(calls[0], { items: items('fresh'), totalCount: 10 });
      expect(write).not.toHaveBeenCalled();
    });

    it('ignores the slot when the sort differs from the one it holds', async () => {
      const { calls, fetchPage } = controlledFetch();
      const { cache, read, write } = buildCache();

      await renderHook(() =>
        usePaginatedResource<Item, 'title'>({
          playlistId: 'p1',
          pageSize: 2,
          // Playlist order, while the slot is title-ascending.
          sortBy: undefined,
          sortOrder: 'asc',
          fetchPage,
          cache,
          label: 'test',
        })
      );

      expect(read).not.toHaveBeenCalled();
      await settle(calls[0], { items: items('fresh'), totalCount: 10 });
      expect(write).not.toHaveBeenCalled();
    });

    it('ignores the slot when the sort order is reversed', async () => {
      const { calls, fetchPage } = controlledFetch();
      const { cache, read, write } = buildCache();

      await renderHook(() =>
        usePaginatedResource<Item, 'title'>({
          playlistId: 'p1',
          pageSize: 2,
          sortBy: 'title',
          sortOrder: 'desc',
          fetchPage,
          cache,
          label: 'test',
        })
      );

      expect(read).not.toHaveBeenCalled();
      await settle(calls[0], { items: items('fresh'), totalCount: 10 });
      expect(write).not.toHaveBeenCalled();
    });

    it('ignores the slot while a search or group filter is active', async () => {
      const { fetchPage } = controlledFetch();
      const { cache, read } = buildCache();

      await renderHook(() =>
        usePaginatedResource<Item, 'title'>({
          playlistId: 'p1',
          pageSize: 2,
          sortBy: 'title',
          search: 'news',
          fetchPage,
          cache,
          label: 'test',
        })
      );

      expect(read).not.toHaveBeenCalled();
    });
  });

  it('debounces only the search leg, applying other filter changes at once', async () => {
    jest.useFakeTimers();
    try {
      const { calls, fetchPage } = controlledFetch();

      const { rerender } = await renderHook(
        ({ search, groups }: { search: string; groups?: string[] }) =>
          usePaginatedResource<Item>({
            playlistId: 'p1',
            pageSize: 2,
            search,
            groups,
            fetchPage,
            label: 'test',
          }),
        { initialProps: { search: '', groups: undefined as string[] | undefined } }
      );

      expect(calls).toHaveLength(1);

      await act(async () => rerender({ search: 'ne', groups: undefined }));
      // Still waiting out the debounce.
      expect(calls).toHaveLength(1);

      // The group change restarts the query anyway, so the pending text rides
      // along instead of costing a second round trip once the debounce fires.
      await act(async () => rerender({ search: 'ne', groups: ['Sports'] }));
      expect(calls).toHaveLength(2);
      expect(calls[1].filters.groups).toEqual(['Sports']);
      expect(calls[1].filters.search).toBe('ne');

      await act(async () => {
        jest.advanceTimersByTime(300);
      });
      expect(calls).toHaveLength(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('treats an empty group filter as matching nothing instead of everything', async () => {
    const { calls, fetchPage } = controlledFetch();

    const { result } = await renderHook(() =>
      usePaginatedResource<Item>({
        playlistId: 'p1',
        pageSize: 2,
        groups: [],
        fetchPage,
        label: 'test',
      })
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(calls).toHaveLength(0);
    expect(result.current.items).toEqual([]);
    expect(result.current.hasMore).toBe(false);

    // Refreshing it asks for nothing either — and must not leave `hasMore` true,
    // which would have the list forever trying to page into an empty filter.
    await act(async () => result.current.refresh());
    expect(calls).toHaveLength(0);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });
});
