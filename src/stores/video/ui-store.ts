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

    console.log(`[VideoUIStore] showControlsTemporarily called with ${timeoutMs}ms timeout`);

    // Clear existing timeout
    if (state.hideControlsTimeoutId) {
      console.log(`[VideoUIStore] Clearing existing timeout: ${state.hideControlsTimeoutId}`);
      clearTimeout(state.hideControlsTimeoutId);
    }

    // Show controls
    set({ showControls: true });
    console.log(`[VideoUIStore] Controls now shown`);

    // Schedule hide
    const timeoutId = setTimeout(() => {
      console.log(`[VideoUIStore] Timeout fired. Hiding controls.`);
      set({ showControls: false, hideControlsTimeoutId: null });
    }, timeoutMs) as unknown as number;

    console.log(`[VideoUIStore] Scheduled hide with timeout ID: ${timeoutId}`);
    set({ hideControlsTimeoutId: timeoutId });
  },

  clearHideControlsTimeout: () => {
    const state = get();
    if (state.hideControlsTimeoutId) {
      console.log(`[VideoUIStore] Manually clearing timeout: ${state.hideControlsTimeoutId}`);
      clearTimeout(state.hideControlsTimeoutId);
      set({ hideControlsTimeoutId: null });
    } else {
      console.log(`[VideoUIStore] clearHideControlsTimeout called but no timeout exists`);
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