import { create } from 'zustand';

type ImportPhase =
  | 'preparing'
  | 'downloading'
  | 'importing'
  | 'processing'
  | 'enriching'
  | 'saving'
  | 'complete'
  | null;

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
  downloading: [5, 30],
  importing: [30, 65],
  processing: [65, 80],
  enriching: [80, 90],
  saving: [90, 98],
  complete: [100, 100],
};

interface ImportProgressState {
  activePlaylistId: string | null;
  phase: ImportPhase;
  overallProgress: number;
  phaseLabel: string;

  startImport: (playlistId: string) => void;
  updateProgress: (playlistId: string, phase: string, current: number, total: number) => void;
  reset: () => void;
}

export const useImportProgressStore = create<ImportProgressState>((set) => ({
  activePlaylistId: null,
  phase: null,
  overallProgress: 0,
  phaseLabel: '',

  startImport: (playlistId: string) => {
    set({
      activePlaylistId: playlistId,
      phase: 'preparing',
      overallProgress: 0,
      phaseLabel: PHASE_LABELS.preparing,
    });
  },

  updateProgress: (playlistId: string, phase: string, current: number, total: number) => {
    const weights = PHASE_WEIGHTS[phase];
    if (!weights) return;

    const [start, end] = weights;
    const phaseProgress =
      total > 0
        ? Math.min(current / total, 1)
        : current > 0
          ? 1 - 1 / (1 + current / 10_000_000)
          : 0;
    const overallProgress = start + phaseProgress * (end - start);

    set({
      activePlaylistId: playlistId,
      phase: phase as ImportPhase,
      overallProgress,
      phaseLabel: PHASE_LABELS[phase] ?? '',
    });
  },

  reset: () => {
    set({
      activePlaylistId: null,
      phase: null,
      overallProgress: 0,
      phaseLabel: '',
    });
  },
}));
