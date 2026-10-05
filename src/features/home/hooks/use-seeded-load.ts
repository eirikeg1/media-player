import { isHomeCacheFresh } from '@/stores/cache';
import { useEffect, useRef } from 'react';

/** What the mount effect still owes a seeded slice, once. */
type SeedAction =
  /** Nothing: the slice on screen was loaded this session. */
  | 'none'
  /** Refresh behind what is already on screen, without a loading frame. */
  | 'revalidate'
  /** Nothing was cached — a normal first load, skeleton and all. */
  | 'load';

function actionFor(seed: { fetchedAt: number } | null): SeedAction {
  if (seed === null) return 'load';
  return isHomeCacheFresh(seed.fetchedAt) ? 'none' : 'revalidate';
}

/**
 * Drive a home hook's loading off the slice it was seeded with.
 *
 * A slice this session loaded *is* the mount fetch and is not repeated (the
 * launch pre-fetch runs it while the loading screen is still up, so refetching
 * on mount would double the request for no new data); an older one is served
 * and refreshed silently behind it; no slice at all loads normally.
 *
 * Runs again whenever `fetch`'s identity changes — a real change of user,
 * playlist, adult filter or history revision — and those runs are ordinary
 * loads.
 */
export function useSeededLoad(
  seed: { fetchedAt: number } | null,
  fetch: (options?: { silent?: boolean }) => Promise<void>,
  cancelInFlightFetch: () => void,
): void {
  const actionRef = useRef<SeedAction>(actionFor(seed));

  useEffect(() => {
    const action = actionRef.current;
    actionRef.current = 'load';
    if (action === 'none') return;
    void fetch({ silent: action === 'revalidate' });
    return cancelInFlightFetch;
  }, [fetch, cancelInFlightFetch]);
}
