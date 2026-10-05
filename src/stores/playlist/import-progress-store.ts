import { create } from 'zustand';

type ImportPhase =
  | 'preparing'
  | 'downloading'
  | 'importing'
  | 'processing'
  | 'enriching'
  | 'saving'
  | 'complete';

const PHASE_LABELS: Record<string, string> = {
  preparing: 'Preparing import...',
  downloading: 'Downloading playlist...',
  importing: 'Importing channels...',
  processing: 'Processing channels...',
  enriching: 'Enriching metadata...',
  saving: 'Saving playlist...',
  complete: 'Complete!',
};

/** Phase weight mapping: [startPercent, endPercent] */
export const PHASE_WEIGHTS: Record<string, [number, number]> = {
  preparing: [0, 5],
  downloading: [5, 45],
  importing: [45, 85],
  processing: [85, 90],
  enriching: [90, 98],
  saving: [98, 100],
  complete: [100, 100],
};

/**
 * How long an entry may sit in the store before it is treated as abandoned.
 *
 * Every import removes its own entry when it settles, so a survivor this old
 * belongs to work that died without reporting back (a killed process, a native
 * crash). Ignoring it keeps one lost import from disabling the schedulers,
 * refreshes and deletions for the rest of the session.
 */
const STALE_IMPORT_MS = 15 * 60_000;

/** Progress of a single playlist import. */
export interface ImportProgressEntry {
  phase: ImportPhase;
  overallProgress: number;
  phaseLabel: string;
  /** When the import started, as epoch milliseconds. */
  startedAt: number;
}

interface ImportProgressState {
  /** One entry per running import, keyed by playlist id. */
  imports: Record<string, ImportProgressEntry>;

  /**
   * Register the start of an import, leaving a live entry untouched.
   *
   * @returns True when this call created the entry, false when one was already
   *   there — the caller that created it is the one that must remove it.
   */
  startImport: (playlistId: string) => boolean;
  updateProgress: (playlistId: string, phase: string, current: number, total: number) => void;
  /** Drop a playlist's entry once its import has settled (success or failure). */
  finishImport: (playlistId: string) => void;
  /** Drop every entry. Escape hatch for a session that lost track of an import. */
  reset: () => void;
}

export const useImportProgressStore = create<ImportProgressState>((set, get) => ({
  imports: {},

  startImport: (playlistId: string) => {
    // Overwriting would reset a running import's bar to 0 and hide its progress.
    if (get().imports[playlistId]) return false;

    set({
      imports: {
        ...get().imports,
        [playlistId]: {
          phase: 'preparing',
          overallProgress: 0,
          phaseLabel: PHASE_LABELS.preparing,
          startedAt: Date.now(),
        },
      },
    });
    return true;
  },

  updateProgress: (playlistId: string, phase: string, current: number, total: number) => {
    const weights = PHASE_WEIGHTS[phase];
    if (!weights) return;

    // Progress for an import nobody started (a late event from a finished run)
    // must not resurrect an entry — that entry would never be removed.
    const existing = get().imports[playlistId];
    if (!existing) return;

    const [start, end] = weights;
    const phaseProgress =
      total > 0
        ? Math.min(current / total, 1)
        : current > 0
          ? 1 - 1 / (1 + current / 10_000_000)
          : 0;

    set({
      imports: {
        ...get().imports,
        [playlistId]: {
          ...existing,
          phase: phase as ImportPhase,
          overallProgress: start + phaseProgress * (end - start),
          phaseLabel: PHASE_LABELS[phase] ?? '',
        },
      },
    });
  },

  finishImport: (playlistId: string) => {
    const { [playlistId]: removed, ...rest } = get().imports;
    if (!removed) return;
    set({ imports: rest });
  },

  reset: () => set({ imports: {} }),
}));

/** Whether an entry describes work that is still expected to report back. */
function isLive(entry: ImportProgressEntry, now: number): boolean {
  return entry.phase !== 'complete' && now - entry.startedAt < STALE_IMPORT_MS;
}

/** The first still-running import, for callers that have no playlist id yet. */
function runningImport(
  imports: Record<string, ImportProgressEntry>,
): ImportProgressEntry | undefined {
  const now = Date.now();
  return Object.values(imports).find((entry) => isLive(entry, now));
}

/**
 * Progress of one playlist's import.
 *
 * Always scoped to a playlist: a screen that reported "the running import"
 * instead would show a background sync of some other playlist as its own.
 * Callers that do not have an id yet (the add form) generate one and hand it to
 * the import.
 */
export function useImportProgress(playlistId: string): ImportProgressEntry | undefined {
  return useImportProgressStore((state) => state.imports[playlistId]);
}

/** Whether an import is running for `playlistId` right now. */
export function useIsImporting(playlistId: string): boolean {
  return useImportProgressStore((state) => {
    const entry = state.imports[playlistId];
    return entry !== undefined && isLive(entry, Date.now());
  });
}

/**
 * Whether an import is running for `playlistId`, read outside React.
 *
 * Used by the actions that must not race an import's own writes (a refresh, an
 * edit, a delete). An abandoned entry is ignored, so a lost import cannot block
 * the playlist forever.
 */
export function isImportRunning(playlistId: string): boolean {
  const entry = useImportProgressStore.getState().imports[playlistId];
  return entry !== undefined && isLive(entry, Date.now());
}

/**
 * Whether any playlist import is running, read outside React.
 *
 * The sync schedulers use this to stay off the network while the user (or the
 * other scheduler) already has an import in flight.
 */
export function isAnyImportRunning(): boolean {
  return runningImport(useImportProgressStore.getState().imports) !== undefined;
}
