import { createJsonFileState } from './json-file-state';

/**
 * Device-level copy of the user settings the background task acts on.
 *
 * Written by the app whenever the current user's setting changes (see
 * `use-background-task`), read by the task on a wake — which may be headless,
 * with no user to read the settings of.
 */

interface PersistedState {
  /** Mirror of `UserSettings.backgroundSyncOnMobileData`; null = never saved. */
  syncOnMobileData: boolean | null;
}

const state = createJsonFileState<PersistedState>({
  fileName: 'background-task-state.json',
  empty: { syncOnMobileData: null },
  parse: (raw) => ({
    syncOnMobileData: typeof raw.syncOnMobileData === 'boolean' ? raw.syncOnMobileData : null,
  }),
  tag: '[BackgroundTask]',
});

export const backgroundStateStore = {
  /**
   * Whether the catalogue steps may download over a metered connection. A
   * value that was never saved reads as off — the shipped default.
   */
  async getSyncOnMobileData(): Promise<boolean> {
    return (await state.read()).syncOnMobileData ?? false;
  },
  async setSyncOnMobileData(allowed: boolean): Promise<void> {
    await state.update({ syncOnMobileData: allowed });
  },
};
