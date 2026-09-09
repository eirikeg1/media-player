import { useEffect } from 'react';
import { InteractionManager } from 'react-native';

import { ensureRecommendationModelLoaded } from '@/services/recommendation-model';
import { EpgService } from '@/services/epg-service';
import { useAppReadyStore } from '@/stores/app';

/**
 * Startup work that nothing on screen waits for.
 *
 * Both tasks contend with the boot queries for the single database mutex — the
 * EPG cleanup writes, and materializing the taste model ends in an FFI load —
 * so they are held back until the UI is revealed (`isReady`) and the resulting
 * animations have settled. Call once in the root layout.
 */
export function useDeferredStartupWork() {
  const isReady = useAppReadyStore((s) => s.isReady);

  useEffect(() => {
    if (!isReady) return;

    const handle = InteractionManager.runAfterInteractions(() => {
      // Best-effort: recommendations fall back to the random recommender, and
      // expired EPG programmes are simply cleaned up on a later launch.
      void ensureRecommendationModelLoaded();
      EpgService.cleanupExpired().catch((err) => {
        console.warn('[DeferredStartup] EPG cleanup failed:', err);
      });
    });

    return () => handle.cancel();
  }, [isReady]);
}
