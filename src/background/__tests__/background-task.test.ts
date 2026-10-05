import { makePlaylist } from '@/test/factories';
import type { Playlist } from '@/types/playlist.types';

import {
  STEP_ESTIMATE_MS,
  TASK_BUDGET_MS,
  TASK_DEADLINE_MS,
  runBackgroundTask,
  type BackgroundTaskDeps,
} from '../background-task';

const NOW = Date.parse('2026-10-05T03:00:00Z');
const HOUR = 3_600_000;

/** Due for both a channel re-import and a guide download. */
function duePlaylist(overrides: Partial<Playlist> = {}): Playlist {
  return makePlaylist({
    syncInterval: 360,
    epgSyncInterval: 1440,
    lastFetchedAt: new Date(NOW - 7 * HOUR),
    lastEpgFetchedAt: new Date(NOW - 25 * HOUR),
    ...overrides,
  });
}

interface Harness {
  deps: BackgroundTaskDeps;
  /** Every unit of work, in the order it ran. */
  calls: string[];
  /** Advance the task's clock, e.g. from inside a fake sync. */
  advance(ms: number): void;
}

function harness(
  playlists: Playlist[],
  overrides: Partial<BackgroundTaskDeps> = {},
): Harness {
  let clock = NOW;
  const calls: string[] = [];
  const deps: BackgroundTaskDeps = {
    now: () => clock,
    prepareCatalogue: jest.fn(async () => undefined),
    listPlaylists: jest.fn(async () => playlists),
    syncChannels: jest.fn(async (id: string) => {
      calls.push(`channels:${id}`);
    }),
    syncGuide: jest.fn(async (id: string) => {
      calls.push(`guide:${id}`);
    }),
    isAppActive: () => false,
    hasPlaybackSession: () => false,
    isCatalogueSyncRunning: () => false,
    isConnectionMetered: async () => false,
    allowsMeteredCatalogueSync: async () => false,
    refreshSports: jest.fn(async () => {
      calls.push('sports');
      return 'ran' as const;
    }),
    ...overrides,
  };
  return {
    deps,
    calls,
    advance: (ms) => {
      clock += ms;
    },
  };
}

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

it('runs playlists, then guides, then sports', async () => {
  const a = duePlaylist({ id: 'a' });
  const b = duePlaylist({ id: 'b' });
  const { deps, calls } = harness([a, b]);

  await expect(runBackgroundTask(deps)).resolves.toBe('ok');

  expect(calls).toEqual(['channels:a', 'channels:b', 'guide:a', 'guide:b', 'sports']);
  // The headless launch's schema check comes before anything reads a row.
  expect(deps.prepareCatalogue).toHaveBeenCalledTimes(1);
});

it('only runs the parts that are due, by the same rule as the foreground', async () => {
  const fresh = duePlaylist({ id: 'fresh', lastFetchedAt: new Date(NOW - HOUR) });
  const off = duePlaylist({ id: 'off', syncInterval: 0, epgSyncInterval: 0 });
  const { deps, calls } = harness([fresh, off]);

  await runBackgroundTask(deps);

  expect(calls).toEqual(['guide:fresh', 'sports']);
});

it('treats a wake with nothing due as healthy', async () => {
  const fresh = duePlaylist({
    lastFetchedAt: new Date(NOW),
    lastEpgFetchedAt: new Date(NOW),
  });
  const { deps, calls } = harness([fresh], {
    refreshSports: jest.fn(async () => 'skipped' as const),
  });

  await expect(runBackgroundTask(deps)).resolves.toBe('ok');
  expect(calls).toEqual([]);
});

it('still runs the guide and sports when a playlist import fails', async () => {
  const a = duePlaylist({ id: 'a' });
  const b = duePlaylist({ id: 'b' });
  const calls: string[] = [];
  const { deps } = harness([a, b], {
    syncChannels: jest.fn(async (id: string) => {
      calls.push(`channels:${id}`);
      if (id === 'a') throw new Error('provider is down');
    }),
    syncGuide: jest.fn(async (id: string) => {
      calls.push(`guide:${id}`);
    }),
    refreshSports: jest.fn(async () => {
      calls.push('sports');
      return 'ran' as const;
    }),
  });

  await expect(runBackgroundTask(deps)).resolves.toBe('failed');
  expect(calls).toEqual(['channels:a', 'channels:b', 'guide:a', 'guide:b', 'sports']);
});

it('still runs sports when the playlists cannot be read', async () => {
  const { deps, calls } = harness([], {
    listPlaylists: jest.fn(async () => {
      throw new Error('database is locked');
    }),
  });

  await expect(runBackgroundTask(deps)).resolves.toBe('failed');
  expect(calls).toEqual(['sports']);
});

it('reports a failed sports refresh', async () => {
  const { deps } = harness([], { refreshSports: jest.fn(async () => 'failed' as const) });

  await expect(runBackgroundTask(deps)).resolves.toBe('failed');
});

describe('catalogue guards', () => {
  const GUARDS: [string, Partial<BackgroundTaskDeps>][] = [
    ['the app is in the foreground', { isAppActive: () => true }],
    ['a stream is playing', { hasPlaybackSession: () => true }],
    ['another catalogue sync is running', { isCatalogueSyncRunning: () => true }],
    [
      'the connection is metered and mobile data is off (the default)',
      { isConnectionMetered: async () => true },
    ],
  ];

  it.each(GUARDS)('skip only the catalogue steps when %s', async (_reason, guard) => {
    const { deps, calls } = harness([duePlaylist({ id: 'a' })], guard);

    await expect(runBackgroundTask(deps)).resolves.toBe('ok');

    expect(calls).toEqual(['sports']);
    expect(deps.listPlaylists).not.toHaveBeenCalled();
  });

  it('sync on a metered connection once the user allows mobile data', async () => {
    const { deps, calls } = harness([duePlaylist({ id: 'a' })], {
      isConnectionMetered: async () => true,
      allowsMeteredCatalogueSync: async () => true,
    });

    await runBackgroundTask(deps);

    expect(calls).toEqual(['channels:a', 'guide:a', 'sports']);
  });

  it('sync on an unmetered connection whatever the mobile-data setting', async () => {
    const allowsMetered = jest.fn(async () => false);
    const { deps, calls } = harness([duePlaylist({ id: 'a' })], {
      isConnectionMetered: async () => false,
      allowsMeteredCatalogueSync: allowsMetered,
    });

    await runBackgroundTask(deps);

    expect(calls).toEqual(['channels:a', 'guide:a', 'sports']);
    expect(allowsMetered).not.toHaveBeenCalled();
  });

  it('are re-checked before each playlist, so a stream started mid-run stops the rest', async () => {
    let playing = false;
    const calls: string[] = [];
    const { deps } = harness([duePlaylist({ id: 'a' }), duePlaylist({ id: 'b' })], {
      hasPlaybackSession: () => playing,
      syncChannels: jest.fn(async (id: string) => {
        calls.push(`channels:${id}`);
        playing = true;
      }),
      syncGuide: jest.fn(async (id: string) => {
        calls.push(`guide:${id}`);
      }),
      refreshSports: jest.fn(async () => {
        calls.push('sports');
        return 'ran' as const;
      }),
    });

    await runBackgroundTask(deps);

    expect(calls).toEqual(['channels:a', 'sports']);
  });
});

describe('time budget', () => {
  it('does not start a unit the budget left cannot cover', async () => {
    const calls: string[] = [];
    const h = harness([duePlaylist({ id: 'a' }), duePlaylist({ id: 'b' })], {
      syncChannels: jest.fn(async (id: string) => {
        calls.push(`channels:${id}`);
        // A slow import: what is left cannot cover another one.
        h.advance(TASK_BUDGET_MS - STEP_ESTIMATE_MS.channels + 1);
      }),
      syncGuide: jest.fn(async (id: string) => {
        calls.push(`guide:${id}`);
        h.advance(STEP_ESTIMATE_MS.guide);
      }),
      refreshSports: jest.fn(async () => {
        calls.push('sports');
        return 'ran' as const;
      }),
    });

    await expect(runBackgroundTask(h.deps)).resolves.toBe('ok');

    // b's import no longer fits; a's guide does, b's then does not, and the
    // minute sports needs is still there.
    expect(calls).toEqual(['channels:a', 'guide:a', 'sports']);
  });

  it('leaves sports out when the catalogue used the whole budget', async () => {
    const h = harness([duePlaylist({ id: 'a' })], {
      syncChannels: jest.fn(async () => {
        h.advance(TASK_BUDGET_MS);
      }),
    });

    await runBackgroundTask(h.deps);

    expect(h.deps.syncGuide).not.toHaveBeenCalled();
    expect(h.deps.refreshSports).not.toHaveBeenCalled();
  });
});

describe('deadline', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('reports back while an import is still running, so the OS queues the next wake', async () => {
    const h = harness([duePlaylist({ id: 'slow' })], {
      // A download that never settles: without a deadline the worker would be
      // stopped by the platform with the task still pending.
      syncChannels: jest.fn(() => new Promise<void>(() => {})),
    });

    const outcome = runBackgroundTask(h.deps);
    await jest.advanceTimersByTimeAsync(TASK_DEADLINE_MS - 1);
    let settled = false;
    void outcome.then(() => {
      settled = true;
    });
    await jest.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);

    await jest.advanceTimersByTimeAsync(1);

    await expect(outcome).resolves.toBe('failed');
    expect(h.deps.syncGuide).not.toHaveBeenCalled();
    expect(h.deps.refreshSports).not.toHaveBeenCalled();
  });

  it('leaves no timer behind when the work finishes first', async () => {
    const h = harness([duePlaylist({ id: 'a' })]);

    await expect(runBackgroundTask(h.deps)).resolves.toBe('ok');

    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('guard ordering', () => {
  it('asks whether a sync is running only after the awaited checks, with nothing in between', async () => {
    // A foreground sync that starts while the connection is being looked up
    // must still be seen: the last question before importing is the
    // synchronous one.
    let foregroundSyncStarted = false;
    const h = harness([duePlaylist({ id: 'a' })], {
      isConnectionMetered: async () => {
        foregroundSyncStarted = true;
        return false;
      },
      isCatalogueSyncRunning: () => foregroundSyncStarted,
    });

    await runBackgroundTask(h.deps);

    expect(h.deps.syncChannels).not.toHaveBeenCalled();
    expect(h.calls).toEqual(['sports']);
  });
});
