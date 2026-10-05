import { create } from 'zustand';

interface SportsCacheEpochState {
  /** Incremented every time the sports caches are invalidated. */
  epoch: number;
  /** Mark everything read before now as describing replaced data. */
  bump: () => void;
}

/**
 * A counter that says "everything the sports feature cached before this number
 * describes data that has since been replaced".
 *
 * The native side owns the durable caches and {@link invalidateSportsCaches}
 * marks them stale, but the app keeps its own copies on top of them — the
 * competition list in a module variable, the visited days in a ref, the
 * once-per-launch team sweep in a module flag, the loaded-event markers in the
 * detail hooks. None of those hear about an invalidation, so a refresh left the
 * screen rendering exactly the data the user asked to replace.
 *
 * Every such cache stores the epoch it was filled under and misses when the
 * store has moved on, which is why the bump has to be synchronous (see
 * `cache-invalidation.ts`): a read racing the invalidation must land on the new
 * epoch, not the old one.
 */
export const useSportsCacheEpochStore = create<SportsCacheEpochState>((set) => ({
  epoch: 0,
  bump: () => set((state) => ({ epoch: state.epoch + 1 })),
}));

/** Subscribe a component to the current epoch. */
export function useSportsCacheEpoch(): number {
  return useSportsCacheEpochStore((state) => state.epoch);
}

/** The current epoch, for caches that live outside React. */
export function getSportsCacheEpoch(): number {
  return useSportsCacheEpochStore.getState().epoch;
}

/** Invalidate every epoch-keyed cache in the feature. */
export function bumpSportsCacheEpoch(): void {
  useSportsCacheEpochStore.getState().bump();
}

/** Test-only: return to the launch epoch so a bump cannot leak between tests. */
export function __resetSportsCacheEpoch(): void {
  useSportsCacheEpochStore.setState({ epoch: 0 });
}
