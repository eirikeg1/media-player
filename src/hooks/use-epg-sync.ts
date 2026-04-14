import { useEffect } from 'react';
import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import { epgSyncScheduler } from '@/services/epg-sync-scheduler';

/**
 * Starts the EPG sync scheduler once playlists are initialized.
 * Call once in the root layout.
 */
export function useEpgSync() {
  const isInitialized = usePlaylistStore((s) => s.isInitialized);

  useEffect(() => {
    if (!isInitialized) return;

    epgSyncScheduler.start();
    return () => epgSyncScheduler.stop();
  }, [isInitialized]);
}
