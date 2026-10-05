import { playlistSyncScheduler } from '@/services/periodic-sync-scheduler';
import { useSyncScheduler } from './use-sync-scheduler';

/**
 * Starts the playlist sync scheduler once playlists are initialized.
 * Call once in the root layout.
 */
export function usePlaylistSync() {
  useSyncScheduler(playlistSyncScheduler);
}
