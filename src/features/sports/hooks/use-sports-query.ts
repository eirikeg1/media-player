import { useAppState } from '@/hooks/use-app-state';
import { getSportsDatabase } from '@/services/sports-service';
import type { SportsDatabase } from 'expo-m3u-parser';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useSportsCacheEpoch } from '../sports-cache-epoch';
import { sportsErrorMessage } from '../sports-errors';

/** What the fetcher is allowed to know about the load it is serving. */
export interface SportsQueryContext<T> {
  /**
   * The load is a background one — a poll, or a reload after the caches were
   * invalidated. Its failure leaves whatever is on screen alone.
   */
  silent: boolean;
  /** The caller asked for fresh data, so every cache age should be ignored. */
  force: boolean;
  /**
   * Hand an intermediate result to the screen without ending the load. A
   * cached-first fetcher publishes what it found in the cache and then keeps
   * going for the authoritative read, so the user browses the old data instead
   * of a spinner.
   */
  publish: (data: T) => void;
}

export interface SportsQueryOptions<K, T> {
  /** What is being asked for. `null` means there is nothing to ask. */
  key: K | null;
  /**
   * Whether the query may run. This is a *visibility* gate (a tab that is not
   * on screen), not a mount gate: disabling keeps whatever has been loaded, so
   * returning to a tab shows it again instead of fetching afresh.
   */
  enabled?: boolean;
  /**
   * How to answer `key`. Read from a ref at call time, so it always sees the
   * latest render's closure and its identity never re-triggers a load.
   */
  fetcher: (db: SportsDatabase, key: K, ctx: SportsQueryContext<T>) => Promise<T>;
  /** Error copy for a failure that carries nothing more specific. */
  fallback: string;
  /** Silent refresh interval while the app is in the foreground; 0 = no poll. */
  pollMs?: number;
  /**
   * Data already in hand for `key`, if any. Returning a value adopts it and
   * makes no request at all — the caller's own cache is the answer.
   */
  initialData?: (key: K) => T | undefined;
  /**
   * Whether a new result is interchangeable with the one on screen. When it is,
   * the previous object keeps its identity so memoised rows below don't
   * re-render for an unchanged value.
   */
  isEqual?: (a: T, b: T) => boolean;
}

export interface SportsQueryResult<T> {
  /** `undefined` until something has been loaded (or seeded) for the key. */
  data: T | undefined;
  isLoading: boolean;
  error: string | null;
  /** Load again. `force` asks the fetcher to ignore every cache age. */
  refresh: (opts?: { force?: boolean }) => Promise<void>;
  /** Write the data directly — for an optimistic update the caller can undo. */
  setData: (update: T | ((previous: T | undefined) => T | undefined)) => void;
}

interface QueryState<T> {
  data: T | undefined;
  isLoading: boolean;
  error: string | null;
}

/**
 * One fetch-state machine for the sports feature.
 *
 * Every section of the feature reads the same native database through the same
 * shape — ask for something, show what is cached, poll it while it can change,
 * survive a cache invalidation, say something useful when it fails — and each
 * one used to hand-roll it. The copies drifted: some cancelled superseded
 * requests and some raced them onto the screen, some cleared their data when
 * the thing being asked for changed and some showed the previous answer under
 * the new name, and only a few had anything to say when the provider refused.
 *
 * What it guarantees:
 * - A superseded request never lands. Every load takes a ticket and a late
 *   answer is dropped, so a slow read for one key cannot overwrite a fast one
 *   for the next.
 * - A new `key` drops the old data first, so nothing is ever rendered under the
 *   wrong heading, and the first frame of the new key already reports loading —
 *   the effect that starts the fetch only runs after that frame.
 * - `pollMs` runs only while the app is in the foreground, and catches up once
 *   on the way back rather than waiting out a full interval. A sheet left open
 *   over a background spell is not a reason to keep requesting.
 * - A cache invalidation ({@link useSportsCacheEpoch}) reloads silently when
 *   there is something on screen: the rows the user is reading stay until their
 *   replacement lands.
 * - A silent failure changes nothing. A visible one sets `error` from
 *   {@link sportsErrorMessage}, never the raw backend text.
 */
export function useSportsQuery<K, T>({
  key,
  enabled = true,
  fetcher,
  fallback,
  pollMs = 0,
  initialData,
  isEqual,
}: SportsQueryOptions<K, T>): SportsQueryResult<T> {
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const initialDataRef = useRef(initialData);
  initialDataRef.current = initialData;
  const isEqualRef = useRef(isEqual);
  isEqualRef.current = isEqual;
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;

  const [state, setState] = useState<QueryState<T>>(() => ({
    data: enabled && key !== null ? initialData?.(key) : undefined,
    isLoading: false,
    error: null,
  }));

  /** The key whose data (or error) `state` describes; `null` while unloaded. */
  const loadedKeyRef = useRef<K | null>(state.data === undefined ? null : key);
  const requestRef = useRef(0);
  /** The data as of this render, for the effect below to branch on. */
  const dataRef = useRef(state.data);
  dataRef.current = state.data;

  const keyRef = useRef(key);
  keyRef.current = key;

  const load = useCallback(async (silent: boolean, force: boolean) => {
    const target = keyRef.current;
    if (target === null) return;

    const requestId = ++requestRef.current;
    // A visible load with nothing to show is a spinner; one that still has data
    // on screen is a revalidation, and replacing those rows with a skeleton
    // would be a worse answer than the slightly stale ones.
    if (!silent) {
      setState((previous) => ({
        data: previous.data,
        isLoading: previous.data === undefined,
        error: null,
      }));
    }

    const publish = (data: T) => {
      if (requestId !== requestRef.current) return;
      loadedKeyRef.current = target;
      setState({ data, isLoading: false, error: null });
    };

    try {
      const db = await getSportsDatabase();
      const result = await fetcherRef.current(db, target, { silent, force, publish });
      if (requestId !== requestRef.current) return;
      loadedKeyRef.current = target;
      setState((previous) => ({
        data:
          previous.data !== undefined && isEqualRef.current?.(previous.data, result)
            ? previous.data
            : result,
        isLoading: false,
        error: null,
      }));
    } catch (err) {
      if (requestId !== requestRef.current) return;
      console.warn('[useSportsQuery] Error:', err);
      setState((previous) => {
        // A background load leaves the screen as it found it: the data on it is
        // still the best answer available, and an error banner for a refresh
        // the user never asked for is noise. With nothing on screen there is
        // nothing to protect — and staying quiet would leave the skeleton up
        // for good, since `isLoading` below only clears on data or an error.
        if (silent && previous.data !== undefined) return previous;
        return {
          data: previous.data,
          isLoading: false,
          error: sportsErrorMessage(err, fallbackRef.current),
        };
      });
    }
  }, []);

  // A key the query has not answered yet must not render the previous key's
  // data for even one frame. Dropped in an effect that is declared before the
  // fetch effect, so it lands first; the synchronous `isLoading` below covers
  // the frame in between.
  const previousKeyRef = useRef(key);
  useEffect(() => {
    if (Object.is(previousKeyRef.current, key)) return;
    previousKeyRef.current = key;
    ++requestRef.current;
    loadedKeyRef.current = null;
    // The ref, not just the state: the fetch effect below runs in this same
    // commit and decides between a spinner and a silent reload by looking at
    // what is on screen, which this drop has just emptied.
    dataRef.current = undefined;
    setState({ data: undefined, isLoading: false, error: null });
  }, [key]);

  // An invalidation replaces the data this query was answered from, so the
  // marker that says "this key is already loaded" has to go with it. Cleared
  // during render so the fetch effect, which re-runs on the same change, sees
  // the query as unanswered and reads again.
  const epoch = useSportsCacheEpoch();
  const epochRef = useRef(epoch);
  if (epochRef.current !== epoch) {
    epochRef.current = epoch;
    loadedKeyRef.current = null;
  }

  // A backgrounded app has nobody reading the screen, and the sheet holding
  // this open can outlive a whole half.
  const appActive = useAppState() === 'active';
  const wasActiveRef = useRef(appActive);

  // Answering the key is not the poll's business, so it does not depend on the
  // app state: folding the two together re-ran this whole branch on every
  // foreground/background flip, for a decision that only `key` and `epoch` can
  // change.
  useEffect(() => {
    if (!enabled || key === null) return;
    if (Object.is(loadedKeyRef.current, key)) return;

    const seeded = initialDataRef.current?.(key);
    if (seeded !== undefined) {
      // The caller already has the answer; a request would be the same work
      // twice. Claim the key so a later enable doesn't fetch it either.
      ++requestRef.current;
      loadedKeyRef.current = key;
      setState({ data: seeded, isLoading: false, error: null });
      return;
    }
    // Silent when there is something on screen: this is an invalidation
    // reload, and the rows the user is reading stay until it lands.
    void load(dataRef.current !== undefined, false);
  }, [key, enabled, epoch, load]);

  useEffect(() => {
    if (pollMs <= 0) return;
    if (!appActive) {
      wasActiveRef.current = false;
      return;
    }
    const resumed = !wasActiveRef.current;
    wasActiveRef.current = true;
    if (!enabled || key === null) return;

    // Back in the foreground: what is on screen is as old as the absence, so
    // catch up now instead of after a full interval. Only for a key this query
    // has already answered — the effect above owns the first load.
    if (resumed && Object.is(loadedKeyRef.current, key)) void load(true, false);

    const interval = setInterval(() => void load(true, false), pollMs);
    return () => clearInterval(interval);
  }, [key, enabled, pollMs, appActive, load]);

  const refresh = useCallback(
    (opts?: { force?: boolean }) => load(false, opts?.force === true),
    [load]
  );

  const setData = useCallback(
    (update: T | ((previous: T | undefined) => T | undefined)) => {
      setState((previous) => ({
        ...previous,
        data:
          typeof update === 'function'
            ? (update as (previous: T | undefined) => T | undefined)(previous.data)
            : update,
      }));
    },
    []
  );

  // The fetch effect only flips `isLoading` after the first commit, so a query
  // that has produced neither data nor an error reports loading synchronously —
  // the first frame shows its skeleton rather than an empty state.
  const isLoading =
    state.isLoading || (enabled && key !== null && state.data === undefined && state.error === null);

  return { data: state.data, isLoading, error: state.error, refresh, setData };
}
