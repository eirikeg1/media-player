import { create } from 'zustand';

export type GestureType = 'fine-seek' | 'volume' | 'brightness';

interface GestureState {
  activeGesture: GestureType | null;
  seekDeltaSeconds: number;
  seekTargetTime: number;
  volume: number;
  brightness: number;

  setActiveGesture: (gesture: GestureType | null) => void;
  setSeekDelta: (delta: number, targetTime: number) => void;
  setVolume: (volume: number) => void;
  setBrightness: (brightness: number) => void;
  reset: () => void;
}

const initialState = {
  activeGesture: null as GestureType | null,
  seekDeltaSeconds: 0,
  seekTargetTime: 0,
  volume: 1,
  brightness: 1,
};

export const useGestureStore = create<GestureState>((set) => ({
  ...initialState,

  setActiveGesture: (activeGesture) => set({ activeGesture }),

  setSeekDelta: (seekDeltaSeconds, seekTargetTime) =>
    set({ seekDeltaSeconds, seekTargetTime }),

  setVolume: (volume) => set({ volume }),

  setBrightness: (brightness) => set({ brightness }),

  reset: () => set(initialState),
}));
