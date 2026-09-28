import { useEffect } from 'react';
import { InteractionManager } from 'react-native';

import { ensureRecommendationModelLoaded } from '@/services/recommendation-model';
import { EpgService } from '@/services/epg-service';
import { useAppReadyStore } from '@/stores/app';
import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import { useUserStore } from '@/stores/user/user-store';

/**
 * Startup work that nothing on screen waits for.
 *
 * Every task here contends with the boot queries for the single database mutex —
 * closing crashed viewing sessions and the EPG cleanup write, and materializing
 * the taste model ends in an FFI load — so they are held back until the UI is
 * revealed (`isReady`), initialization has finished (`isInitialized`, which the
 * splash backstop can outrun) and the resulting animations have settled. Call
 * once in the root layout.
 */
export function useDeferredStartupWork() {
  const isReady = useAppReadyStore((s) => s.isReady);
  const isInitialized = usePlaylistStore((s) => s.isInitialized);

  useEffect(() => {
    if (!isReady || !isInitialized) return;

    const handle = InteractionManager.runAfterInteractions(() => {
      // Best-effort: recommendations fall back to the random recommender,
      // expired EPG programmes are simply cleaned up on a later launch, and a
      // session left open by a crash is closed on the next one.
      void useUserStore.getState().closeOrphanedSessions();
      void ensureRecommendationModelLoaded();
      EpgService.cleanupExpired().catch((err) => {
        console.warn('[DeferredStartup] EPG cleanup failed:', err);
      });
    });

    return () => handle.cancel();
  }, [isReady, isInitialized]);
}
