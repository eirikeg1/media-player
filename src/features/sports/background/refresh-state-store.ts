import { createJsonFileState } from '@/background/json-file-state';
import {
  DEFAULT_SPORTS_BACKGROUND_REFRESH,
  type SportsBackgroundRefresh,
  type SportsRefreshMode,
} from '@/types/user.types';

import type { RefreshStateStore } from './ports';

/**
 * File-backed {@link RefreshStateStore}.
 *
 * A headless wake has no signed-in user to read the preference from, so it is
 * mirrored into a small JSON file alongside the last run (see
 * {@link createJsonFileState} for why a file, and what makes it safe).
 */

interface PersistedState {
  lastRunAt: number | null;
  preference: SportsBackgroundRefresh | null;
}

const REFRESH_MODES: readonly SportsRefreshMode[] = ['off', 'interval', 'daily', 'night'];

/**
 * The file is written by an older (or newer) build as much as by this one, so
 * every field is checked before it is trusted; anything unexpected falls back
 * to the shipped default for that field.
 */
function parsePreference(value: unknown): SportsBackgroundRefresh | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Partial<Record<keyof SportsBackgroundRefresh, unknown>>;
  const mode = REFRESH_MODES.find((m) => m === raw.mode);
  if (!mode) return null;
  return {
    mode,
    intervalHours:
      typeof raw.intervalHours === 'number' && Number.isFinite(raw.intervalHours)
        ? raw.intervalHours
        : DEFAULT_SPORTS_BACKGROUND_REFRESH.intervalHours,
    dailyTime:
      typeof raw.dailyTime === 'string'
        ? raw.dailyTime
        : DEFAULT_SPORTS_BACKGROUND_REFRESH.dailyTime,
    refreshOnOpen:
      typeof raw.refreshOnOpen === 'boolean'
        ? raw.refreshOnOpen
        : DEFAULT_SPORTS_BACKGROUND_REFRESH.refreshOnOpen,
  };
}

const state = createJsonFileState<PersistedState>({
  fileName: 'sports-refresh-state.json',
  empty: { lastRunAt: null, preference: null },
  parse: (raw) => ({
    lastRunAt:
      typeof raw.lastRunAt === 'number' && Number.isFinite(raw.lastRunAt) ? raw.lastRunAt : null,
    preference: parsePreference(raw.preference),
  }),
  tag: '[sports-refresh]',
});

export const refreshStateStore: RefreshStateStore = {
  async getLastRunAt() {
    return (await state.read()).lastRunAt;
  },
  async setLastRunAt(ts: number) {
    await state.update({ lastRunAt: ts });
  },
  async getPreference() {
    return (await state.read()).preference;
  },
  async setPreference(pref: SportsBackgroundRefresh) {
    await state.update({ preference: pref });
  },
};
