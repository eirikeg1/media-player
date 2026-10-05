import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import type { TabHref } from '@/features/user/visible-tabs';

/**
 * Leave a pushed route the way its close affordance and the hardware back
 * button both should: by walking the stack back.
 *
 * The fallback is what keeps a deep link from becoming a dead end — opened
 * straight into a detail route there is no history to pop, and `back()` would
 * simply do nothing, leaving a close button that does not close.
 *
 * @param fallback The tab to land on when this route is the whole stack. Typed
 *   as the tab href union so a pathname that names no tab cannot compile.
 */
export function useRouteDismiss(fallback: TabHref): () => void {
  const router = useRouter();

  return useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(fallback);
  }, [router, fallback]);
}
