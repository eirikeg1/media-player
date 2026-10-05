import { AppState, type AppStateStatus } from 'react-native';
import { isChannelSyncDue, isGuideSyncDue } from '@/lib/sync-intervals';
import {
  isCatalogueSyncRunning,
  syncPlaylistChannels,
  syncPlaylistGuide,
} from '@/stores/playlist/playlist-sync';
import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import { ImportAlreadyRunningError } from '@/stores/playlist/run-import';
import type { Playlist } from '@/types/playlist.types';

/** How often a running scheduler looks for overdue work. */
const CHECK_INTERVAL_MS = 60_000;

/**
 * How long one playlist's sync may take before the scheduler stops waiting for
 * it. Comfortably beyond the native import's own watchdog (30 minutes), so this
 * only trips on a promise that will never settle at all — without it, one such
 * run would hold the "a sync is running" gate closed for the whole session.
 */
const RUN_TIMEOUT_MS = 45 * 60_000;

/**
 * How long a playlist that failed to sync is left alone.
 *
 * Its due-ness is derived from the last *successful* sync, so without a backoff
 * a provider that is down would be retried on every 60-second check.
 */
const RETRY_AFTER_FAILURE_MS = 30 * 60_000;

/** How a scheduler decides what is overdue and what to do about it. */
export interface SyncSchedulerConfig {
  /** Name used in logs, e.g. `Playlist` or `EPG`. */
  name: string;
  /** Whether this playlist is overdue at `now` (epoch milliseconds). */
  isDue: (playlist: Playlist, now: number) => boolean;
  /** Bring one overdue playlist up to date; rejects when it could not. */
  run: (playlist: Playlist) => Promise<void>;
}

export interface SyncScheduler {
  /** Begin checking periodically and on every return to the foreground. */
  start: () => void;
  /** Stop checking and release the AppState subscription when last to stop. */
  stop: () => void;
}

/**
 * Schedulers that are currently started. They share one AppState subscription
 * because every one of them wants the same two signals — foreground and
 * background — and a subscription per scheduler multiplies foreground work.
 */
const activeSchedulers = new Set<InternalScheduler>();
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;

/**
 * Number of sync runs in flight across all schedulers.
 *
 * Playlist imports and EPG downloads hit the same provider (whose account
 * usually allows a single connection), so they queue behind one another rather
 * than competing: a tick is skipped entirely while any sync is running — this
 * counter for the schedulers' own batches, {@link isCatalogueSyncRunning} for
 * every other sync in the process (a user's refresh and its guide download, or
 * the OS background task running while the app is still alive).
 */
let runsInFlight = 0;

interface InternalScheduler extends SyncScheduler {
  resumeInterval: () => void;
  pauseInterval: () => void;
  tickIfDue: () => void;
}

function handleAppStateChange(nextState: AppStateStatus): void {
  if (nextState === 'active') {
    for (const scheduler of activeSchedulers) {
      scheduler.resumeInterval();
      scheduler.tickIfDue();
    }
    return;
  }

  // Only a real background transition stops the timers. iOS also reports
  // 'inactive' for a notification shade, an incoming call or the app switcher,
  // and pausing on those would restart the interval from zero every time.
  if (nextState === 'background') {
    for (const scheduler of activeSchedulers) {
      scheduler.pauseInterval();
    }
  }
}

/** Reject after `ms` unless `promise` settles first. Does not cancel the work. */
function withTimeout<T>(promise: Promise<T>, ms: number, description: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${description} did not finish within ${ms / 60_000} minutes`)),
      ms,
    );
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

/**
 * Create a scheduler that periodically syncs the playlists the config calls
 * overdue.
 *
 * Every scheduler shares the AppState subscription and the "a sync is running"
 * gate with all the others, so the app never has two syncs of any kind in
 * flight at once.
 */
export function createSyncScheduler(config: SyncSchedulerConfig): SyncScheduler {
  const { name, isDue, run } = config;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  /** When the last tick actually ran its checks (0 = never). */
  let lastTickAt = 0;
  /** Earliest next attempt per playlist, after a failed run. */
  const retryAfter = new Map<string, number>();

  const tick = async (): Promise<void> => {
    // Both this scheduler's own previous tick and every other sync count.
    if (runsInFlight > 0 || isCatalogueSyncRunning()) return;

    const now = Date.now();
    lastTickAt = now;

    const overdue = usePlaylistStore
      .getState()
      .playlists.filter((p) => isDue(p, now) && (retryAfter.get(p.id) ?? 0) <= now);
    if (overdue.length === 0) return;

    runsInFlight += 1;
    console.log(`[${name}Sync] ${overdue.length} playlist(s) overdue`);

    try {
      for (const playlist of overdue) {
        // The user may have started an import of their own while the previous
        // playlist was syncing. The provider allows a single connection, so
        // yield to them and let the next check pick up what is left.
        if (isCatalogueSyncRunning()) {
          console.log(`[${name}Sync] Yielding to a user-triggered import`);
          break;
        }

        try {
          console.log(`[${name}Sync] Syncing "${playlist.name}" (${playlist.id})`);
          await withTimeout(run(playlist), RUN_TIMEOUT_MS, `${name} sync of "${playlist.name}"`);
          retryAfter.delete(playlist.id);
        } catch (err) {
          retryAfter.set(playlist.id, Date.now() + RETRY_AFTER_FAILURE_MS);
          console.warn(
            `[${name}Sync] Failed to sync "${playlist.name}" — retrying in ` +
              `${RETRY_AFTER_FAILURE_MS / 60_000} minutes:`,
            err,
          );
        }
      }
    } finally {
      runsInFlight -= 1;
    }
  };

  const scheduler: InternalScheduler = {
    resumeInterval: () => {
      if (intervalId) return;
      intervalId = setInterval(() => void tick(), CHECK_INTERVAL_MS);
    },

    pauseInterval: () => {
      if (!intervalId) return;
      clearInterval(intervalId);
      intervalId = null;
    },

    // Backgrounding stops the interval, so a return to the foreground has to
    // make up for the checks that were missed — but only those: a quick app
    // switch must not re-check every playlist.
    tickIfDue: () => {
      if (Date.now() - lastTickAt < CHECK_INTERVAL_MS) return;
      void tick();
    },

    start: () => {
      if (activeSchedulers.has(scheduler)) return;

      console.log(`[${name}Sync] Starting`);
      activeSchedulers.add(scheduler);
      scheduler.resumeInterval();

      appStateSubscription ??= AppState.addEventListener('change', handleAppStateChange);
    },

    stop: () => {
      console.log(`[${name}Sync] Stopping`);
      activeSchedulers.delete(scheduler);
      scheduler.pauseInterval();
      // A restart should check immediately rather than inherit the old spacing
      // or a backoff from a provider that may since have recovered.
      lastTickAt = 0;
      retryAfter.clear();

      if (activeSchedulers.size === 0) {
        appStateSubscription?.remove();
        appStateSubscription = null;
        // Nothing is left to decrement the counter: a run still in flight is
        // abandoned here, and its `finally` would drive this negative.
        runsInFlight = 0;
      }
    },
  };

  return scheduler;
}

/** Re-imports playlists whose `syncInterval` has elapsed. */
export const playlistSyncScheduler = createSyncScheduler({
  name: 'Playlist',
  isDue: isChannelSyncDue,
  run: async (playlist) => {
    try {
      await syncPlaylistChannels(playlist.id);
    } catch (err) {
      // Someone else's import of this playlist is still going and will stamp
      // it when done — not a failure to back off from.
      if (err instanceof ImportAlreadyRunningError) return;
      throw err;
    }
  },
});

/** Re-downloads programme data for playlists whose `epgSyncInterval` has elapsed. */
export const epgSyncScheduler = createSyncScheduler({
  name: 'Epg',
  isDue: isGuideSyncDue,
  // A guide download that failed rejects without a stamp, which hands the
  // retry to the backoff above instead of hiding the missing guide for a whole
  // interval.
  run: async (playlist) => {
    await syncPlaylistGuide(playlist.id);
  },
});
