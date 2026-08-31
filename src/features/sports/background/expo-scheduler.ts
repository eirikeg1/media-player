import { getSportsDatabase } from '@/services/sports-service';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import type { BackgroundScheduler } from './ports';
import { refreshStateStore } from './refresh-state-store';
import { performBackgroundRefresh } from './refresh-task';

/**
 * The one platform-aware module of the background refresh: it binds the OS task
 * APIs to the pure policy and the injectable task, so everything else in this
 * directory stays free of expo imports and testable with plain fakes.
 *
 * Importing this module *defines* the task. That has to happen in global scope
 * on every launch — including the headless one the OS starts for a wake — or
 * the OS finds no executor for the registered name and drops the task.
 */

export const TASK_NAME = 'sports-background-refresh';

TaskManager.defineTask(TASK_NAME, async () => {
  try {
    const outcome = await performBackgroundRefresh({
      stateStore: refreshStateStore,
      getSportsDatabase,
      getFavoriteTeamIds: async (db) => (await db.getFavoriteTeams()).map((team) => team.providerId),
      now: () => new Date(),
    });
    // Nothing was due — that is a healthy wake, not a failure.
    return outcome === 'failed'
      ? BackgroundTask.BackgroundTaskResult.Failed
      : BackgroundTask.BackgroundTaskResult.Success;
  } catch (err) {
    // The task body must never throw: an unhandled rejection here crashes a
    // headless launch the user cannot see or recover from.
    console.warn('[sports-refresh] Background task crashed:', err);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export const expoBackgroundScheduler: BackgroundScheduler = {
  /** Re-registering an already-registered task just updates its interval. */
  async register(minutes: number) {
    await BackgroundTask.registerTaskAsync(TASK_NAME, { minimumInterval: minutes });
  },

  async unregister() {
    // Unregistering a task the OS never registered throws, and "off" is the
    // state on every launch until the user turns the refresh on.
    if (!(await TaskManager.isTaskRegisteredAsync(TASK_NAME))) return;
    await BackgroundTask.unregisterTaskAsync(TASK_NAME);
  },

  async isAvailable() {
    return (await BackgroundTask.getStatusAsync()) === BackgroundTask.BackgroundTaskStatus.Available;
  },
};
