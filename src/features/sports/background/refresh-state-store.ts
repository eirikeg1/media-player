import {
  DEFAULT_SPORTS_BACKGROUND_REFRESH,
  type SportsBackgroundRefresh,
  type SportsRefreshMode,
} from '@/types/user.types';
import { File, Paths } from 'expo-file-system';

import type { RefreshStateStore } from './ports';

/**
 * File-backed {@link RefreshStateStore}.
 *
 * An OS wake starts the app headless: no SQLite connection, no zustand store
 * and no signed-in user. A single small JSON file next to the databases is the
 * one thing the task can always read, so the preference is mirrored here
 * alongside the last run.
 *
 * Every read is total — a missing, unreadable or corrupt file reads as "nothing
 * stored" rather than throwing, because a broken file must not stop the app
 * from starting or the task from falling back to the defaults.
 */

const FILE_NAME = 'sports-refresh-state.json';

interface PersistedState {
  lastRunAt: number | null;
  preference: SportsBackgroundRefresh | null;
}

const EMPTY_STATE: PersistedState = { lastRunAt: null, preference: null };

const REFRESH_MODES: readonly SportsRefreshMode[] = ['off', 'interval', 'daily', 'night'];

function stateFile(): File {
  return new File(Paths.document, FILE_NAME);
}

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

/**
 * What the file holds, once it has been read.
 *
 * The file API is synchronous on the JS thread, so every read used to block it
 * — and this state is read on launch, on every settings write and on every
 * wake. One copy in memory means the file is touched once per process for
 * reading; writes still go through, since the file is the whole point.
 */
let cached: PersistedState | null = null;

/**
 * Serialises every access. Storing one field is a read-modify-write of a shared
 * file: two of them interleaved (the settings screen saving a preference while
 * the task records its run) would each write the other's field back to the
 * value it had before, silently losing one of the two updates.
 */
let tail: Promise<unknown> = Promise.resolve();

function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = tail.then(task, task);
  // The chain must survive a rejection, or every later access rejects with it.
  tail = run.catch(() => undefined);
  return run;
}

async function readFile(): Promise<PersistedState> {
  try {
    const file = stateFile();
    if (!file.exists) return EMPTY_STATE;
    const parsed: unknown = JSON.parse(await file.text());
    if (typeof parsed !== 'object' || parsed === null) return EMPTY_STATE;
    const raw = parsed as Partial<Record<keyof PersistedState, unknown>>;
    return {
      lastRunAt:
        typeof raw.lastRunAt === 'number' && Number.isFinite(raw.lastRunAt) ? raw.lastRunAt : null,
      preference: parsePreference(raw.preference),
    };
  } catch (err) {
    console.warn('[sports-refresh] Could not read refresh state:', err);
    return EMPTY_STATE;
  }
}

async function read(): Promise<PersistedState> {
  cached ??= await readFile();
  return cached;
}

/**
 * Read-modify-write, so storing one field never drops the other.
 *
 * Merged onto what is on *disk*, not onto the cached copy: an OS wake runs the
 * refresh task in its own process, which writes `lastRunAt` there. Merging onto
 * a cache read before that wake would write the task's run back to the value
 * this process last saw, and the task would then re-run far too early.
 */
async function update(patch: Partial<PersistedState>): Promise<void> {
  const next: PersistedState = { ...(await readFile()), ...patch };
  // Memory first: a failed write must not leave this process disagreeing with
  // itself about a preference the user already changed.
  cached = next;
  try {
    // `write` creates the file when it is missing; the document directory the
    // databases live in is always there.
    stateFile().write(JSON.stringify(next));
  } catch (err) {
    console.warn('[sports-refresh] Could not write refresh state:', err);
  }
}

export const refreshStateStore: RefreshStateStore = {
  async getLastRunAt() {
    return serialize(async () => (await read()).lastRunAt);
  },
  async setLastRunAt(ts: number) {
    await serialize(() => update({ lastRunAt: ts }));
  },
  async getPreference() {
    return serialize(async () => (await read()).preference);
  },
  async setPreference(pref: SportsBackgroundRefresh) {
    await serialize(() => update({ preference: pref }));
  },
};
