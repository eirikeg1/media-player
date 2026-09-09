import { create } from 'zustand';

interface VideoUIState {
  // Controls visibility
  showControls: boolean;

  // Timeout management
  hideControlsTimeoutId: number | null;

  // Actions
  setShowControls: (show: boolean) => void;
  setHideControlsTimeout: (timeoutId: number | null) => void;
  showControlsTemporarily: (timeoutMs?: number) => void;
  clearHideControlsTimeout: () => void;
  reset: () => void;
}

const initialState = {
  showControls: false,
  hideControlsTimeoutId: null,
};

export const useVideoUIStore = create<VideoUIState>((set, get) => ({
  ...initialState,

  setShowControls: (showControls) => set({ showControls }),

  setHideControlsTimeout: (hideControlsTimeoutId) => set({ hideControlsTimeoutId }),

  showControlsTemporarily: (timeoutMs = 3000) => {
    const state = get();

    // Clear existing timeout
    if (state.hideControlsTimeoutId) {
      clearTimeout(state.hideControlsTimeoutId);
    }

    // Show controls
    set({ showControls: true });

    // Schedule hide
    const timeoutId = setTimeout(() => {
      set({ showControls: false, hideControlsTimeoutId: null });
    }, timeoutMs) as unknown as number;

    set({ hideControlsTimeoutId: timeoutId });
  },

  clearHideControlsTimeout: () => {
    const state = get();
    if (state.hideControlsTimeoutId) {
      clearTimeout(state.hideControlsTimeoutId);
      set({ hideControlsTimeoutId: null });
    }
  },

  reset: () => {
    const state = get();
    if (state.hideControlsTimeoutId) {
      clearTimeout(state.hideControlsTimeoutId);
    }
    set(initialState);
  },
}));