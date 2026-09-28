import { useCallback, useEffect, useRef, useState } from 'react';

/** Only an actual search change is debounced; other filters apply immediately. */
export const SEARCH_DEBOUNCE_MS = 300;

export type PaginatedContentType = 'live' | 'movie' | 'series';

export interface PaginatedPage<T> {
  items: T[];
  totalCount: number;
}

/**
 * The filters a single query generation was started with. Every page of one
 * generation is fetched with this exact object, so appended pages can't be
 * ordered differently from the first one.
 */
export interface PaginatedFilters<TSortBy extends string = string> {
  playlistId: string;
  limit: number;
  groups?: string[];
  search?: string;
  contentType?: PaginatedContentType;
  sortBy?: TSortBy;
  sortOrder: 'asc' | 'desc';
  excludeAdult?: boolean;
  favoriteIds?: string[];
}

/**
 * Access to the shared first-page cache. One slot per playlist and content type
 * is shared by every consumer, so it can only stand in for a query that matches
 * the slot exactly — hence the shape it was written with is declared here.
 */
export interface PaginatedResourceCache<T> {
  /**
   * Page size of the cached slot. A consumer paging at any other size must
   * neither read nor write it, or its shorter page would truncate the slot for
   * everyone else.
   */
  pageSize: number;
  /** Sort the slot is ordered by; a query sorted otherwise cannot use it. */
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
  /** The cached first page, or null when nothing usable is stored. */
  read: () => PaginatedPage<T> | null;
  write: (page: PaginatedPage<T>) => void;
}

export interface UsePaginatedResourceOptions<T, TSortBy extends string = string> {
  playlistId: string | null | undefined;
  contentType?: PaginatedContentType;
  pageSize: number;
  groups?: string[];
  search?: string;
  sortBy?: TSortBy;
  sortOrder?: 'asc' | 'desc';
  excludeAdult?: boolean;
  /**
   * Favourite ids, which move matching rows to the front of the *server*
   * result. Snapshotted per query generation so toggling a favourite doesn't
   * re-order pages mid-scroll.
   */
  favoriteIds?: string[];
  /** When true, render from cache only — no network fetch (tab not active yet). */
  deferNetworkFetch?: boolean;
  /**
   * Fetches one page. `signal` is aborted as soon as a newer query supersedes
   * this one, so implementations may bail out early.
   */
  fetchPage: (
    offset: number,
    filters: PaginatedFilters<TSortBy>,
    signal: AbortSignal
  ) => Promise<PaginatedPage<T>>;
  cache?: PaginatedResourceCache<T>;
  /** Prefix for error logs, e.g. `usePaginatedChannels`. */
  label: string;
}

export interface UsePaginatedResourceReturn<T> {
  items: T[];
  isLoading: boolean;
  isLoadingMore: boolean;
  /**
   * True while `refresh()` re-fetches the first page. The loaded items stay on
   * screen for the whole re-fetch, so this is what a pull-to-refresh spinner
   * binds to — never `isLoading`, which means "there is nothing to show yet".
   */
  isRefreshing: boolean;
  hasMore: boolean;
  error: string | null;
  totalCount: number;
  loadMore: () => void;
  /** Re-fetches from the first page, keeping the current items until it lands. */
  refresh: () => void;
  /** Re-runs whichever page failed, keeping already-loaded pages. */
  retry: () => void;
}

/** What a running fetch is allowed to touch: only the flag it raised itself. */
type FetchMode = 'initial' | 'revalidate' | 'refresh' | 'append';

interface QuerySnapshot<TSortBy extends string> {
  playlistId: string;
  filters: PaginatedFilters<TSortBy>;
}

/** Keeps the same array reference while the contents are unchanged. */
function useStableArray<T>(value: T[] | undefined): T[] | undefined {
  const ref = useRef(value);
  if (
    value?.length !== ref.current?.length ||
    value?.some((entry, index) => entry !== ref.current?.[index])
  ) {
    ref.current = value;
  }
  return ref.current;
}

/**
 * Trails `value` by `delayMs`. The initial value is adopted immediately, so a
 * screen restored with a search term doesn't wait out a debounce.
 *
 * A change of `flushKey` adopts the pending value at once: another filter is
 * restarting the query anyway, and letting the stale text ride along would ask
 * the server twice — first for the old text, then again when the debounce fires.
 */
function useDebouncedValue<T>(value: T, delayMs: number, flushKey: string): T {
  const [debounced, setDebounced] = useState(value);
  const flushKeyRef = useRef(flushKey);

  if (flushKeyRef.current !== flushKey) {
    flushKeyRef.current = flushKey;
    if (value !== debounced) setDebounced(value);
  }

  useEffect(() => {
    if (value === debounced) return;
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, debounced, delayMs]);

  return debounced;
}

/**
 * Offset pagination over a server-filtered playlist resource.
 *
 * The single source of truth for channel, movie and series paging: filter
 * changes restart the query, `loadMore` appends, and a shared first-page cache
 * renders instantly while the first page revalidates in the background.
 */
export function usePaginatedResource<T, TSortBy extends string = string>({
  playlistId,
  contentType,
  pageSize,
  groups,
  search,
  sortBy,
  sortOrder,
  excludeAdult,
  favoriteIds,
  deferNetworkFetch,
  fetchPage,
  cache,
  label,
}: UsePaginatedResourceOptions<T, TSortBy>): UsePaginatedResourceReturn<T> {
  const [items, setItems] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [loadedPlaylistId, setLoadedPlaylistId] = useState<string | null>(null);

  // Callbacks and identity-unstable inputs live in refs so a caller that
  // re-creates them every render can't restart the query in a loop.
  const fetchPageRef = useRef(fetchPage);
  fetchPageRef.current = fetchPage;
  const cacheRef = useRef(cache);
  cacheRef.current = cache;
  const favoriteIdsRef = useRef(favoriteIds);
  favoriteIdsRef.current = favoriteIds;
  const labelRef = useRef(label);
  labelRef.current = label;
  const deferRef = useRef(deferNetworkFetch);
  deferRef.current = deferNetworkFetch;
  /** Read by `refresh()`, which behaves differently with an empty list. */
  const itemsRef = useRef(items);
  itemsRef.current = items;

  /** Aborted whenever a newer generation starts — it *is* the generation. */
  const abortRef = useRef<AbortController | null>(null);
  /** Guards against two fetches for the same generation running at once. */
  const inFlightRef = useRef(false);
  const offsetRef = useRef(0);
  /** Offset of the page whose fetch failed, for `retry()`. */
  const failedOffsetRef = useRef<number | null>(null);
  const querySnapshotRef = useRef<QuerySnapshot<TSortBy> | null>(null);
  const canWriteCacheRef = useRef(false);
  /**
   * The query the items on screen belong to. Only a *different* query makes the
   * loaded items stale — which is what tells a deferred generation whether it
   * has to clear them (see the effect below).
   */
  const loadedQueryKeyRef = useRef<string | null>(null);

  const stableGroups = useStableArray(groups);
  const effectiveSortOrder = sortOrder ?? 'asc';
  // Everything a query is made of except the search text, which trails it.
  const filterKey = [
    playlistId,
    contentType,
    pageSize,
    // `undefined` (no group filter) has to read differently from an empty list,
    // which is a filter that matches nothing.
    stableGroups === undefined ? '*' : stableGroups.join(','),
    sortBy,
    effectiveSortOrder,
    excludeAdult,
  ].join('|');
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS, filterKey);
  const queryKey = `${filterKey}|${debouncedSearch ?? ''}`;
  const hasGroupFilter = stableGroups !== undefined;
  // An explicitly empty group list is a filter that matches nothing (e.g. none
  // of the favorite groups exist in this playlist) — the opposite of the
  // `undefined` "no filter" case, and not a question worth asking the server.
  const matchesNoGroup = hasGroupFilter && stableGroups.length === 0;

  // The cached slot holds one specific query per playlist, so it can only stand
  // in for — or be overwritten by — a query matching it on every dimension: no
  // search, no group filter, and the slot's own sort and page size.
  const isDefaultView =
    !!cache &&
    !debouncedSearch &&
    !hasGroupFilter &&
    sortBy === (cache.sortBy as TSortBy | undefined) &&
    effectiveSortOrder === cache.sortOrder &&
    pageSize === cache.pageSize;

  const snapshotFavoriteIds = useCallback(
    () => (favoriteIdsRef.current?.length ? favoriteIdsRef.current : undefined),
    []
  );

  /** Invalidates in-flight work and clears the guard so a new fetch can start. */
  const beginGeneration = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    inFlightRef.current = false;
    // The superseded fetch no longer clears this itself (its own `finally` must
    // not touch a flag the new generation may have raised), so the generation
    // that invalidates it lowers it here.
    setIsRefreshing(false);
  }, []);

  const fetchAt = useCallback(async (offset: number, mode: FetchMode) => {
    const query = querySnapshotRef.current;
    const signal = abortRef.current?.signal;
    if (!query || !signal || inFlightRef.current) return;
    // A filter that matches nothing has no page to ask for.
    if (query.filters.groups?.length === 0) return;

    inFlightRef.current = true;
    const isFirstPage = offset === 0;
    if (mode === 'initial') setIsLoading(true);
    if (mode === 'refresh') setIsRefreshing(true);
    if (mode === 'append') setIsLoadingMore(true);
    setError(null);

    try {
      const page = await fetchPageRef.current(offset, query.filters, signal);
      if (signal.aborted) return;

      failedOffsetRef.current = null;
      setHasMore(offset + page.items.length < page.totalCount);
      offsetRef.current = offset + page.items.length;

      if (isFirstPage) {
        setItems(page.items);
        setTotalCount(page.totalCount);
        if (canWriteCacheRef.current) cacheRef.current?.write(page);
      } else {
        setItems((previous) => [...previous, ...page.items]);
      }
    } catch (err) {
      if (signal.aborted) return;
      const message = err instanceof Error ? err.message : 'Failed to load content';
      console.error(`[${labelRef.current}] ${message}`);
      failedOffsetRef.current = offset;
      setError(message);
      // A failed background revalidation (or refresh) keeps the page already on
      // screen; only a foreground first-page load has nothing left to show.
      if (mode === 'initial') setItems([]);
    } finally {
      // `isLoadingMore` is cleared even for a superseded fetch — nothing else
      // ever lowers it, and left stuck it kills infinite scroll for good.
      if (mode === 'append') setIsLoadingMore(false);
      // The other flags belong to whichever generation is current: a superseded
      // fetch clearing `isLoading` would announce "loaded" over the empty list
      // its replacement is still filling ("No channels", mid-load). The newer
      // generation raises and lowers them itself.
      if (!signal.aborted) {
        if (mode === 'initial') setIsLoading(false);
        if (mode === 'refresh') setIsRefreshing(false);
        inFlightRef.current = false;
        setLoadedPlaylistId(query.playlistId);
      }
    }
  }, []);

  // Restart the query whenever any filter changes.
  useEffect(() => {
    // A hook parked with no playlist keeps its data: nothing renders it, and
    // clearing would make the screen flash on the way back.
    if (!playlistId) return;

    beginGeneration();
    offsetRef.current = 0;
    failedOffsetRef.current = null;
    canWriteCacheRef.current = isDefaultView;
    querySnapshotRef.current = {
      playlistId,
      filters: {
        playlistId,
        limit: pageSize,
        groups: stableGroups,
        search: debouncedSearch || undefined,
        contentType,
        sortBy,
        sortOrder: effectiveSortOrder,
        excludeAdult,
        favoriteIds: snapshotFavoriteIds(),
      },
    };

    if (matchesNoGroup) {
      setItems([]);
      setTotalCount(0);
      setHasMore(false);
      setError(null);
      // No fetch runs for this query, so nothing else would ever lower the flag.
      setIsLoading(false);
      setLoadedPlaylistId(playlistId);
      loadedQueryKeyRef.current = queryKey;
      return;
    }

    const cached = isDefaultView ? cacheRef.current?.read() ?? null : null;
    if (cached && cached.items.length > 0) {
      setItems(cached.items);
      setTotalCount(cached.totalCount);
      setHasMore(cached.items.length < cached.totalCount);
      setError(null);
      setIsLoading(false);
      setLoadedPlaylistId(playlistId);
      loadedQueryKeyRef.current = queryKey;
      offsetRef.current = cached.items.length;
      if (!deferNetworkFetch) void fetchAt(0, 'revalidate');
      return;
    }

    if (deferNetworkFetch) {
      // Nothing cached answers this query. Items loaded for a *different* one
      // would be read as this query's result, so they go and the skeleton stays
      // up until the tab is live; a defer that merely parks an unchanged query
      // (the inactive half of the Videos tab) keeps what it already shows.
      if (loadedQueryKeyRef.current !== queryKey) {
        setItems([]);
        setTotalCount(0);
        setHasMore(true);
        setError(null);
        setIsLoading(true);
      }
      return;
    }

    setItems([]);
    setHasMore(true);
    loadedQueryKeyRef.current = queryKey;
    void fetchAt(0, 'initial');
  }, [
    playlistId,
    contentType,
    pageSize,
    stableGroups,
    matchesNoGroup,
    debouncedSearch,
    sortBy,
    effectiveSortOrder,
    excludeAdult,
    deferNetworkFetch,
    isDefaultView,
    queryKey,
    beginGeneration,
    fetchAt,
    snapshotFavoriteIds,
  ]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const loadMore = useCallback(() => {
    // A deferred generation has no query running yet; appending to it would
    // fetch the page the defer exists to postpone.
    if (deferRef.current || !hasMore || inFlightRef.current) return;
    void fetchAt(offsetRef.current, 'append');
  }, [hasMore, fetchAt]);

  const refresh = useCallback(() => {
    const query = querySnapshotRef.current;
    if (!query) return;

    beginGeneration();
    // A pull-to-refresh is exactly when a newly starred channel should move to
    // the front, so the favourites snapshot is retaken here.
    querySnapshotRef.current = {
      ...query,
      filters: { ...query.filters, favoriteIds: snapshotFavoriteIds() },
    };
    offsetRef.current = 0;
    failedOffsetRef.current = null;

    // A filter that matches nothing has no page to re-fetch — and `fetchAt`
    // bails out on it — so this settles the state itself instead of leaving
    // `hasMore` claiming there is another page to scroll into.
    if (query.filters.groups?.length === 0) {
      setItems([]);
      setTotalCount(0);
      setHasMore(false);
      setError(null);
      setIsLoading(false);
      return;
    }

    setHasMore(true);
    // The loaded items stay on screen until the new first page lands: blanking
    // them first dropped the grid (and the EPG guide) back to its skeleton on
    // every pull-to-refresh. With nothing to keep, this *is* the first load.
    void fetchAt(0, itemsRef.current.length > 0 ? 'refresh' : 'initial');
  }, [beginGeneration, fetchAt, snapshotFavoriteIds]);

  const retry = useCallback(() => {
    const failedOffset = failedOffsetRef.current;
    if (failedOffset !== null && failedOffset > 0) {
      beginGeneration();
      void fetchAt(failedOffset, 'append');
      return;
    }
    refresh();
  }, [beginGeneration, fetchAt, refresh]);

  return {
    items,
    // A playlist switch has to read as loading from the first render, before
    // the effect has had a chance to raise the flag.
    isLoading: isLoading || (!!playlistId && loadedPlaylistId !== playlistId),
    isLoadingMore,
    isRefreshing,
    hasMore,
    error,
    totalCount,
    loadMore,
    refresh,
    retry,
  };
}
