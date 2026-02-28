import { useEffect } from 'react';
import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import { playlistSyncScheduler } from '@/services/playlist-sync-scheduler';

/**
 * Starts the playlist sync scheduler once playlists are initialized.
 * Call once in the root layout.
 */
export function usePlaylistSync() {
  const isInitialized = usePlaylistStore((s) => s.isInitialized);

  useEffect(() => {
    if (!isInitialized) return;

    playlistSyncScheduler.start();
    return () => playlistSyncScheduler.stop();
  }, [isInitialized]);
}
