/**
 * The import-progress store tracks one entry per playlist: two playlists can
 * import at once (a manual refresh while the scheduler syncs another), and each
 * card must report its own progress rather than the last event that arrived.
 *
 * Its entries are also the gate every other import path reads, so an entry that
 * outlives the work it describes is what would disable refreshes, deletions and
 * both schedulers for the rest of the session.
 */
import {
  isAnyImportRunning,
  isImportRunning,
  useImportProgressStore,
} from '@/stores/playlist/import-progress-store';
import { resetStores } from '@/test/helpers';

const STALE_AFTER_MS = 15 * 60_000;

beforeEach(() => {
  resetStores(useImportProgressStore);
});

afterEach(() => {
  jest.useRealTimers();
});

it('starts an import with the preparing phase', () => {
  jest.useFakeTimers({ now: 1_000 });

  expect(useImportProgressStore.getState().startImport('pl-1')).toBe(true);

  expect(useImportProgressStore.getState().imports['pl-1']).toEqual({
    phase: 'preparing',
    overallProgress: 0,
    phaseLabel: 'Preparing import...',
    startedAt: 1_000,
  });
});

it('leaves a running import alone and tells the caller it owns nothing', () => {
  const { startImport, updateProgress } = useImportProgressStore.getState();
  startImport('pl-1');
  updateProgress('pl-1', 'importing', 1, 2);

  // A second caller joining the same import must not reset the bar to zero.
  expect(startImport('pl-1')).toBe(false);
  expect(useImportProgressStore.getState().imports['pl-1']).toMatchObject({
    phase: 'importing',
    overallProgress: 65,
  });
});

it('keeps concurrent imports apart', () => {
  const { startImport, updateProgress } = useImportProgressStore.getState();
  startImport('pl-1');
  startImport('pl-2');

  updateProgress('pl-1', 'importing', 1, 2);

  const { imports } = useImportProgressStore.getState();
  expect(imports['pl-1'].phase).toBe('importing');
  expect(imports['pl-1'].overallProgress).toBe(65); // halfway through 45..85
  expect(imports['pl-2'].phase).toBe('preparing');
});

it('ignores progress for an unknown phase', () => {
  useImportProgressStore.getState().startImport('pl-1');

  useImportProgressStore.getState().updateProgress('pl-1', 'teleporting', 1, 1);

  expect(useImportProgressStore.getState().imports['pl-1'].phase).toBe('preparing');
});

it('ignores progress for an import nobody started', () => {
  // A late event from an import that already settled would otherwise create an
  // entry with no owner left to remove it.
  useImportProgressStore.getState().updateProgress('pl-gone', 'importing', 1, 2);

  expect(useImportProgressStore.getState().imports).toEqual({});
});

it('drops only the finished import', () => {
  const { startImport, finishImport } = useImportProgressStore.getState();
  startImport('pl-1');
  startImport('pl-2');

  finishImport('pl-1');

  expect(Object.keys(useImportProgressStore.getState().imports)).toEqual(['pl-2']);
});

it('clears every entry on reset', () => {
  const { startImport, reset } = useImportProgressStore.getState();
  startImport('pl-1');
  startImport('pl-2');

  reset();

  expect(useImportProgressStore.getState().imports).toEqual({});
});

describe('isAnyImportRunning', () => {
  it('is false with no imports', () => {
    expect(isAnyImportRunning()).toBe(false);
  });

  it('is true while an import is in a working phase', () => {
    useImportProgressStore.getState().startImport('pl-1');

    expect(isAnyImportRunning()).toBe(true);
  });

  it('is false once the only import reports complete', () => {
    useImportProgressStore.getState().startImport('pl-1');
    useImportProgressStore.getState().updateProgress('pl-1', 'complete', 1, 1);

    expect(isAnyImportRunning()).toBe(false);
  });

  it('ignores an entry left behind by an import that never reported back', () => {
    jest.useFakeTimers();
    useImportProgressStore.getState().startImport('pl-1');
    expect(isAnyImportRunning()).toBe(true);

    jest.advanceTimersByTime(STALE_AFTER_MS);

    // The schedulers, refreshes and deletions all read this: a lost import must
    // not disable them for the rest of the session.
    expect(isAnyImportRunning()).toBe(false);
    expect(isImportRunning('pl-1')).toBe(false);
  });
});

describe('isImportRunning', () => {
  it('is scoped to the playlist asked about', () => {
    useImportProgressStore.getState().startImport('pl-1');

    expect(isImportRunning('pl-1')).toBe(true);
    expect(isImportRunning('pl-2')).toBe(false);
  });
});
