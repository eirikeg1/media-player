import { AppState, type AppStateStatus } from 'react-native';
import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import { EpgService } from '@/services/epg-service';
import { playlistRepository } from '@/db/playlist-repository';

const CHECK_INTERVAL_MS = 60_000; // Check every 60 seconds

/**
 * Singleton scheduler that periodically checks playlists for overdue EPG syncs
 * and triggers EPG re-fetch when `lastEpgFetchedAt + epgSyncInterval` has elapsed.
 */
class EpgSyncScheduler {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isSyncing = false;
  private appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;

  /** Start the periodic check loop and listen to AppState changes. */
  start() {
    if (this.intervalId) return; // already running

    console.log('[EpgSyncScheduler] Starting');
    this.startInterval();

    this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
  }

  /** Stop the check loop and clean up listeners. */
  stop() {
    console.log('[EpgSyncScheduler] Stopping');
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
      console.log('[EpgSyncScheduler] App foregrounded — resuming');
      this.startInterval();
      // Run an immediate check on foreground
      this.tick();
    } else {
      console.log('[EpgSyncScheduler] App backgrounded — pausing');
      this.clearInterval();
    }
  };

  private async tick() {
    if (this.isSyncing) return;

    const { playlists } = usePlaylistStore.getState();
    const now = Date.now();

    // Collect playlists that are overdue for EPG sync
    const overdue = playlists.filter((p) => {
      if (!p.epgSyncInterval || p.epgSyncInterval <= 0) return false;
      if (!p.lastEpgFetchedAt) return true; // never fetched → overdue
      const nextSyncAt = p.lastEpgFetchedAt.getTime() + p.epgSyncInterval * 60_000;
      return now >= nextSyncAt;
    });

    if (overdue.length === 0) return;

    this.isSyncing = true;
    console.log(`[EpgSyncScheduler] ${overdue.length} playlist(s) overdue for EPG sync`);

    try {
      for (const playlist of overdue) {
        try {
          console.log(`[EpgSyncScheduler] Syncing EPG for "${playlist.name}" (${playlist.id})`);
          await EpgService.detectAndFetchEpgSources(playlist.id, playlist.epgUrl);

          // Update lastEpgFetchedAt in DB and store
          const epgNow = new Date();
          await playlistRepository.update(playlist.id, { lastEpgFetchedAt: epgNow });
          usePlaylistStore.setState((state) => ({
            playlists: state.playlists.map((p) =>
              p.id === playlist.id ? { ...p, lastEpgFetchedAt: epgNow } : p
            ),
          }));
        } catch (err) {
          console.warn(`[EpgSyncScheduler] Failed to sync EPG for "${playlist.name}":`, err);
        }
      }
    } finally {
      this.isSyncing = false;
    }
  }
}

export const epgSyncScheduler = new EpgSyncScheduler();
