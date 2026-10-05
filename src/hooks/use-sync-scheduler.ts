import { useEffect } from 'react';
import type { SyncScheduler } from '@/services/periodic-sync-scheduler';
import { usePlaylistStore } from '@/stores/playlist/playlist-store';

/**
 * Run a periodic sync scheduler for as long as the component is mounted and
 * playlists are loaded — there is nothing to sync before that.
 *
 * @param scheduler The scheduler to start; must be a stable module singleton
 */
export function useSyncScheduler(scheduler: SyncScheduler): void {
  const isInitialized = usePlaylistStore((s) => s.isInitialized);

  useEffect(() => {
    if (!isInitialized) return;

    scheduler.start();
    return () => scheduler.stop();
  }, [isInitialized, scheduler]);
}
