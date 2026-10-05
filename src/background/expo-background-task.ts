import { initializeDatabase } from '@/db/migrations';
import { playlistRepository } from '@/db/playlist-repository';
import { refreshStateStore } from '@/features/sports/background/refresh-state-store';
import { performBackgroundRefresh } from '@/features/sports/background/refresh-task';
import { getSportsDatabase } from '@/services/sports-service';
import {
  isCatalogueSyncRunning,
  syncPlaylistChannels,
  syncPlaylistGuide,
} from '@/stores/playlist/playlist-sync';
import { usePlaybackSessionStore } from '@/stores/video/playback-session-store';
import NetInfo from '@react-native-community/netinfo';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { AppState } from 'react-native';

import { backgroundStateStore } from './background-state-store';
import { runBackgroundTask, type BackgroundTaskDeps } from './background-task';
import type { BackgroundScheduler } from './ports';

/**
 * The one platform-aware module of the background task: it binds the OS task
 * APIs, the repository, the stores and the network state to the pure task, so
 * everything else in this directory stays free of expo imports and testable
 * with plain fakes.
 *
 * Importing this module *defines* the task. That has to happen in global scope
 * on every launch — including the headless one the OS starts for a wake, where
 * "no views are mounted" and so no hook ever runs — or the OS finds no executor
 * for the registered name and drops the task.
 */

export const TASK_NAME = 'app-background-sync';

/**
 * The name builds before this one registered the sports-only task under. It is
 * retired on the first launch of this build (see {@link expoBackgroundScheduler});
 * until then a wake an older build scheduled still runs the current task
 * rather than finding no executor.
 */
const LEGACY_TASK_NAME = 'sports-background-refresh';

/**
 * Whether the connection is metered. Unknown counts as metered: the download
 * is tens of MB, nobody is watching it, and the next wake can try again.
 */
async function isConnectionMetered(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return state.details?.isConnectionExpensive ?? true;
}

const taskDeps: BackgroundTaskDeps = {
  now: () => Date.now(),
  // A headless launch has run no boot sequence. The migrations are
  // single-flight and a no-op when current, so a wake inside a live process
  // joins what the boot sequence already did. The Rust database opens (and
  // migrates) itself on first use, as it does for the sports refresh.
  prepareCatalogue: initializeDatabase,
  listPlaylists: () => playlistRepository.getAll(),
  syncChannels: syncPlaylistChannels,
  syncGuide: syncPlaylistGuide,
  isAppActive: () => AppState.currentState === 'active',
  hasPlaybackSession: () => usePlaybackSessionStore.getState().session !== null,
  isCatalogueSyncRunning,
  isConnectionMetered,
  allowsMeteredCatalogueSync: () => backgroundStateStore.getSyncOnMobileData(),
  refreshSports: () =>
    performBackgroundRefresh({
      stateStore: refreshStateStore,
      getSportsDatabase,
      getFavoriteTeamIds: async (db) => (await db.getFavoriteTeams()).map((team) => team.providerId),
      now: () => new Date(),
    }),
};

async function executeTask(): Promise<BackgroundTask.BackgroundTaskResult> {
  try {
    const outcome = await runBackgroundTask(taskDeps);
    // Nothing was due — that is a healthy wake, not a failure.
    return outcome === 'failed'
      ? BackgroundTask.BackgroundTaskResult.Failed
      : BackgroundTask.BackgroundTaskResult.Success;
  } catch (err) {
    // The task body must never throw: an unhandled rejection here crashes a
    // headless launch the user cannot see or recover from.
    console.warn('[BackgroundTask] Background task crashed:', err);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
}

TaskManager.defineTask(TASK_NAME, executeTask);
TaskManager.defineTask(LEGACY_TASK_NAME, executeTask);

/** Unregister a task if the OS has it — unregistering one it does not have throws. */
async function unregisterIfRegistered(name: string): Promise<void> {
  if (!(await TaskManager.isTaskRegisteredAsync(name))) return;
  await BackgroundTask.unregisterTaskAsync(name);
}

export const expoBackgroundScheduler: BackgroundScheduler = {
  /**
   * The legacy registration goes first: expo-background-task drives every task
   * from one worker whose interval is the last registered task's, so a
   * leftover would both wake the app for nothing and run the work twice.
   *
   * A changed interval needs a fresh registration. On Android, registering a
   * name that is already registered only stores the new options — the worker
   * keeps its old cadence until the process restarts — so the task is taken
   * down and put back. An unchanged one is left strictly alone: registering
   * re-queues the worker with a fresh initial delay, and doing that on every
   * launch would keep pushing the next wake away.
   */
  async register(minutes: number) {
    await unregisterIfRegistered(LEGACY_TASK_NAME);

    const registered = (await TaskManager.getRegisteredTasksAsync()).find(
      (task) => task.taskName === TASK_NAME,
    );
    if (registered) {
      const options = registered.options as { minimumInterval?: number } | null | undefined;
      if (options?.minimumInterval === minutes) return;
      await BackgroundTask.unregisterTaskAsync(TASK_NAME);
    }
    await BackgroundTask.registerTaskAsync(TASK_NAME, { minimumInterval: minutes });
  },

  async unregister() {
    await unregisterIfRegistered(LEGACY_TASK_NAME);
    await unregisterIfRegistered(TASK_NAME);
  },

  async isAvailable() {
    return (await BackgroundTask.getStatusAsync()) === BackgroundTask.BackgroundTaskStatus.Available;
  },
};
