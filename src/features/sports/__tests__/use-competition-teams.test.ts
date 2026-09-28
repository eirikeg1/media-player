import { getSportsDatabase } from '@/services/sports-service';
import { resetSportsCacheEpoch } from '@/test/helpers';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { SportsDatabase, Team } from 'expo-m3u-parser';

import { CACHE_ONLY_SECS } from '../fixture-fetch';
import {
  __resetCompetitionTeamsSweep,
  useAllCompetitionTeams,
} from '../hooks/use-all-competition-teams';
import { useCompetitionTeams } from '../hooks/use-competition-teams';
import { bumpSportsCacheEpoch } from '../sports-cache-epoch';

function team(providerId: number, name: string): Team {
  return { providerId, provider: 'sofascore', name };
}

/** A promise the test resolves by hand, to hold a refresh in flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/**
 * The cached-teams table as the sweep actually moves it: the read answers from
 * what is stored, and the sweep is what puts teams there. Tests that turn on
 * *whether* the sweep paid off cannot fake the two independently.
 */
function fakeTeamStore() {
  const store = {
    teams: [] as Team[],
    /** Spy the sweep so it stores `produced`, and answer reads from the store. */
    spyOnSweep(produced: Team[]) {
      return jest.spyOn(db, 'refreshAllCompetitionTeams').mockImplementation(async () => {
        store.teams = produced;
        return produced.length;
      });
    },
  };
  jest.spyOn(db, 'getAllCachedCompetitionTeams').mockImplementation(async () => store.teams);
  return store;
}

let db: SportsDatabase;

beforeEach(async () => {
  db = await getSportsDatabase();
  resetSportsCacheEpoch();
  // The "once per launch" gate is module state; each test is its own launch.
  __resetCompetitionTeamsSweep();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useAllCompetitionTeams', () => {
  it('renders the cached set without running the sweep', async () => {
    jest.spyOn(db, 'getAllCachedCompetitionTeams').mockResolvedValue([team(1, 'Arsenal')]);
    const sweep = jest.spyOn(db, 'refreshAllCompetitionTeams');

    const { result } = await renderHook(() => useAllCompetitionTeams());

    await waitFor(() => expect(result.current.teams).toHaveLength(1));
    expect(result.current.isLoading).toBe(false);
    // The sweep is minutes of paced provider requests holding the sports handle;
    // opening the picker over a warm cache must not pay for it.
    expect(sweep).not.toHaveBeenCalled();
  });

  it('sweeps on an explicit refresh and shows the refreshed set', async () => {
    const sweep = deferred<number>();
    jest
      .spyOn(db, 'getAllCachedCompetitionTeams')
      .mockResolvedValueOnce([team(1, 'Arsenal')])
      .mockResolvedValue([team(1, 'Arsenal'), team(2, 'Chelsea')]);
    const refresh = jest.spyOn(db, 'refreshAllCompetitionTeams').mockReturnValue(sweep.promise);

    const { result } = await renderHook(() => useAllCompetitionTeams());
    await waitFor(() => expect(result.current.teams).toHaveLength(1));

    await act(async () => {
      void result.current.refresh();
    });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(result.current.isRefreshing).toBe(true);

    sweep.resolve(1);
    await waitFor(() => expect(result.current.teams).toHaveLength(2));
    await waitFor(() => expect(result.current.isRefreshing).toBe(false));
  });

  it('keeps loading through the sweep when the cache is empty', async () => {
    const sweep = deferred<number>();
    jest.spyOn(db, 'getAllCachedCompetitionTeams').mockResolvedValue([]);
    const refresh = jest.spyOn(db, 'refreshAllCompetitionTeams').mockReturnValue(sweep.promise);

    const { result } = await renderHook(() => useAllCompetitionTeams());

    // Nothing to show, so this open does wait on the sweep.
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(result.current.isLoading).toBe(true);

    sweep.resolve(0);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it('sweeps at most once per launch', async () => {
    const store = fakeTeamStore();
    const refresh = store.spyOnSweep([team(1, 'Arsenal')]);

    const first = await renderHook(() => useAllCompetitionTeams());
    await waitFor(() => expect(first.result.current.teams).toHaveLength(1));

    // Reopening the picker is not a reason to sweep again.
    const second = await renderHook(() => useAllCompetitionTeams());
    await waitFor(() => expect(second.result.current.isLoading).toBe(false));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('retries the sweep on the next open when it produced nothing', async () => {
    const store = fakeTeamStore();
    const refresh = store.spyOnSweep([]);

    const first = await renderHook(() => useAllCompetitionTeams());
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    // An empty picker with no explanation reads as a broken modal, and a sweep
    // that found nothing bought nothing — so it says so and stays retryable.
    await waitFor(() =>
      expect(first.result.current.error).toBe(
        'No teams found. Retry to sweep the competitions again.'
      )
    );
    expect(first.result.current.isLoading).toBe(false);

    await renderHook(() => useAllCompetitionTeams());
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
  });

  it('surfaces a failed sweep and retries it on demand', async () => {
    const store = fakeTeamStore();
    const sweep = jest
      .spyOn(db, 'refreshAllCompetitionTeams')
      .mockRejectedValueOnce(Object.assign(new Error('403'), { code: 'BLOCKED' }))
      .mockImplementation(async () => {
        store.teams = [team(1, 'Arsenal')];
        return 1;
      });

    const { result } = await renderHook(() => useAllCompetitionTeams());

    // An empty picker with no explanation is indistinguishable from a provider
    // that simply knows no teams.
    await waitFor(() =>
      expect(result.current.error).toBe(
        'The score provider is refusing requests right now — try again later.'
      )
    );
    expect(result.current.isLoading).toBe(false);

    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.teams).toHaveLength(1);
    expect(sweep).toHaveBeenCalledTimes(2);
  });

  it('sweeps again after the caches are invalidated', async () => {
    const store = fakeTeamStore();
    const refresh = store.spyOnSweep([team(1, 'Arsenal')]);

    const first = await renderHook(() => useAllCompetitionTeams());
    await waitFor(() => expect(first.result.current.teams).toHaveLength(1));

    // The invalidation drops the very team lists that sweep filled in, so the
    // once-per-launch gate has to open again or the picker stays empty for the
    // rest of the process.
    await act(async () => {
      store.teams = [];
      bumpSportsCacheEpoch();
    });

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    const second = await renderHook(() => useAllCompetitionTeams());
    await waitFor(() => expect(second.result.current.isLoading).toBe(false));
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});

describe('useCompetitionTeams', () => {
  it('serves the cache-only read first, then updates from the TTL read', async () => {
    const ttlRead = deferred<Team[]>();
    const reads = jest
      .spyOn(db, 'getCompetitionTeams')
      .mockResolvedValueOnce([team(1, 'Arsenal')])
      .mockReturnValueOnce(ttlRead.promise);

    const { result } = await renderHook(() => useCompetitionTeams(17));

    await waitFor(() => expect(result.current.teams).toHaveLength(1));
    expect(result.current.isLoading).toBe(false);
    expect(reads).toHaveBeenNthCalledWith(1, 17, CACHE_ONLY_SECS);
    expect(reads).toHaveBeenNthCalledWith(2, 17, 21_600);

    ttlRead.resolve([team(1, 'Arsenal'), team(2, 'Chelsea')]);
    await waitFor(() => expect(result.current.teams).toHaveLength(2));
  });

  it('shows the teams it has under the error of the read that failed', async () => {
    jest
      .spyOn(db, 'getCompetitionTeams')
      .mockResolvedValueOnce([team(1, 'Arsenal')])
      .mockRejectedValueOnce(new Error('FfiException: sqlite busy'))
      .mockResolvedValue([team(1, 'Arsenal'), team(2, 'Chelsea')]);

    const { result } = await renderHook(() => useCompetitionTeams(17));

    // The cached list is still browsable; the error says the refresh behind it
    // is what failed.
    await waitFor(() => expect(result.current.error).toBe("Couldn't load this competition's teams."));
    expect(result.current.teams).toHaveLength(1);

    await act(async () => {
      result.current.retry();
    });
    await waitFor(() => expect(result.current.teams).toHaveLength(2));
    expect(result.current.error).toBeNull();
  });

  it('clears the list without fetching when no competition is selected', async () => {
    const reads = jest.spyOn(db, 'getCompetitionTeams');

    const { result } = await renderHook(() => useCompetitionTeams(null));

    await waitFor(() => expect(result.current.teams).toHaveLength(0));
    expect(reads).not.toHaveBeenCalled();
  });
});
