import { AppState, type AppStateStatus } from 'react-native';
import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import { useImportProgressStore } from '@/stores/playlist/import-progress-store';

const CHECK_INTERVAL_MS = 60_000; // Check every 60 seconds

/**
 * Singleton scheduler that periodically checks playlists for overdue syncs
 * and triggers a refresh when `lastFetchedAt + syncInterval` has elapsed.
 */
class PlaylistSyncScheduler {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isSyncing = false;
  private appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;

  /** Start the periodic check loop and listen to AppState changes. */
  start() {
    if (this.intervalId) return; // already running

    console.log('[SyncScheduler] Starting');
    this.startInterval();

    this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
  }

  /** Stop the check loop and clean up listeners. */
  stop() {
    console.log('[SyncScheduler] Stopping');
    this.clearInterval();

    this.appStateSubscription?.remove();
    this.appStateSubscription = null;
  }

  private startInterval() {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => this.tick(), CHECK_INTERVAL_MS);
  }

  private clearInterval() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private handleAppStateChange = (nextState: AppStateStatus) => {
    if (nextState === 'active') {
      console.log('[SyncScheduler] App foregrounded — resuming');
      this.startInterval();
      // Run an immediate check on foreground
      this.tick();
    } else {
      console.log('[SyncScheduler] App backgrounded — pausing');
      this.clearInterval();
    }
  };

  private async tick() {
    if (this.isSyncing) return;

    const { playlists } = usePlaylistStore.getState();
    const now = Date.now();

    // Collect playlists that are overdue for sync
    const overdue = playlists.filter((p) => {
      if (!p.syncInterval || p.syncInterval <= 0) return false;
      if (!p.lastFetchedAt) return true; // never fetched → overdue
      const nextSyncAt = p.lastFetchedAt.getTime() + p.syncInterval * 60_000;
      return now >= nextSyncAt;
    });

    if (overdue.length === 0) return;

    this.isSyncing = true;
    console.log(`[SyncScheduler] ${overdue.length} playlist(s) overdue for sync`);

    try {
      const { refreshPlaylist } = usePlaylistStore.getState();
      for (const playlist of overdue) {
        // Skip playlists that are already being imported (e.g. manual refresh)
        const { activePlaylistId, phase } = useImportProgressStore.getState();
        if (activePlaylistId === playlist.id && phase !== null && phase !== 'complete') {
          console.log(`[SyncScheduler] Skipping "${playlist.name}" — import already in progress`);
          continue;
        }

        try {
          console.log(`[SyncScheduler] Syncing "${playlist.name}" (${playlist.id})`);
          await refreshPlaylist(playlist.id, { silent: true });
        } catch (err) {
          console.warn(`[SyncScheduler] Failed to sync "${playlist.name}":`, err);
        }
      }
    } finally {
      this.isSyncing = false;
    }
  }
}

export const playlistSyncScheduler = new PlaylistSyncScheduler();
