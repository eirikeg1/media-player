import { getSportsDatabase } from '@/services/sports-service';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { SportsDatabase, TeamSearchResult } from 'expo-m3u-parser';

import { CACHE_ONLY_SECS } from '../fixture-fetch';
import { useAllCompetitionTeams } from '../hooks/use-all-competition-teams';
import { useCompetitionTeams } from '../hooks/use-competition-teams';

function team(providerId: number, name: string): TeamSearchResult {
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

let db: SportsDatabase;

beforeEach(async () => {
  db = await getSportsDatabase();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useAllCompetitionTeams', () => {
  it('shows the cached set before the refresh sweep finishes, then the refreshed one', async () => {
    const sweep = deferred<number>();
    jest
      .spyOn(db, 'getAllCachedCompetitionTeams')
      .mockResolvedValueOnce([team(1, 'Arsenal')])
      .mockResolvedValueOnce([team(1, 'Arsenal'), team(2, 'Chelsea')]);
    jest.spyOn(db, 'refreshAllCompetitionTeams').mockReturnValue(sweep.promise);

    const { result } = await renderHook(() => useAllCompetitionTeams());

    // Cached rows render while the sweep is still in flight.
    await waitFor(() => expect(result.current.teams).toHaveLength(1));
    expect(result.current.isLoading).toBe(false);

    sweep.resolve(1);
    await waitFor(() => expect(result.current.teams).toHaveLength(2));
  });

  it('keeps loading through the sweep when the cache is empty', async () => {
    const sweep = deferred<number>();
    jest.spyOn(db, 'getAllCachedCompetitionTeams').mockResolvedValue([]);
    const refresh = jest.spyOn(db, 'refreshAllCompetitionTeams').mockReturnValue(sweep.promise);

    const { result } = await renderHook(() => useAllCompetitionTeams());

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(result.current.isLoading).toBe(true);

    sweep.resolve(0);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });
});

describe('useCompetitionTeams', () => {
  it('serves the cache-only read first, then updates from the TTL read', async () => {
    const ttlRead = deferred<TeamSearchResult[]>();
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

  it('clears the list without fetching when no competition is selected', async () => {
    const reads = jest.spyOn(db, 'getCompetitionTeams');

    const { result } = await renderHook(() => useCompetitionTeams(null));

    await waitFor(() => expect(result.current.teams).toHaveLength(0));
    expect(reads).not.toHaveBeenCalled();
  });
});
