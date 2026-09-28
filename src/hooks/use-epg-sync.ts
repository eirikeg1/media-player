import { epgSyncScheduler } from '@/services/periodic-sync-scheduler';
import { useSyncScheduler } from './use-sync-scheduler';

/**
 * Starts the EPG sync scheduler once playlists are initialized.
 * Call once in the root layout.
 */
export function useEpgSync() {
  useSyncScheduler(epgSyncScheduler);
}
