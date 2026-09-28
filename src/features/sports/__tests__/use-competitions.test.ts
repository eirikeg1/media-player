import { getSportsDatabase } from '@/services/sports-service';
import { resetSportsCacheEpoch } from '@/test/helpers';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { Competition, SportsDatabase } from 'expo-m3u-parser';

import { __resetCompetitionsCache, useCompetitions } from '../hooks/use-competitions';
import { bumpSportsCacheEpoch } from '../sports-cache-epoch';

function competition(providerId: number, name: string): Competition {
  return { providerId, provider: 'sofascore', name, international: false };
}

/** A promise the test resolves by hand, to hold a read in flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

let db: SportsDatabase;

beforeEach(async () => {
  resetSportsCacheEpoch();
  // The list is shared by every mount in the process; each test is its own.
  __resetCompetitionsCache();
  db = await getSportsDatabase();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useCompetitions', () => {
  it('serves concurrent mounts from one native call', async () => {
    const pending = deferred<Competition[]>();
    const read = jest.spyOn(db, 'getCompetitions').mockReturnValue(pending.promise);

    const first = await renderHook(() => useCompetitions());
    const second = await renderHook(() => useCompetitions());

    // Three screens ask for this list, two of them at once behind the panel's
    // single connection: one promise has to serve all of them.
    expect(read).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve([competition(17, 'PL')]);
    });
    await waitFor(() => expect(first.result.current.competitions).toHaveLength(1));
    expect(second.result.current.competitions).toHaveLength(1);
  });

  it('surfaces a failure and retries on demand', async () => {
    const read = jest
      .spyOn(db, 'getCompetitions')
      .mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'NETWORK' }))
      .mockResolvedValue([competition(17, 'PL')]);

    const { result } = await renderHook(() => useCompetitions());

    await waitFor(() => expect(result.current.error).toBe('No connection to the score provider.'));

    await act(async () => {
      result.current.retry();
    });
    await waitFor(() => expect(result.current.competitions).toHaveLength(1));
    expect(result.current.error).toBeNull();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('refetches after the caches are invalidated', async () => {
    const read = jest
      .spyOn(db, 'getCompetitions')
      .mockResolvedValueOnce([competition(17, 'PL')])
      .mockResolvedValue([competition(17, 'PL'), competition(8, 'La Liga')]);

    const { result } = await renderHook(() => useCompetitions());
    await waitFor(() => expect(result.current.competitions).toHaveLength(1));

    // Six hours young, but describing data the user just asked to replace.
    await act(async () => {
      bumpSportsCacheEpoch();
    });

    await waitFor(() => expect(result.current.competitions).toHaveLength(2));
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('does not cache a read the invalidation overtook', async () => {
    const pending = deferred<Competition[]>();
    const read = jest
      .spyOn(db, 'getCompetitions')
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue([competition(8, 'La Liga')]);

    const { result } = await renderHook(() => useCompetitions());
    expect(read).toHaveBeenCalledTimes(1);

    // The invalidation lands while the first read is still out: its result
    // describes the data being replaced, so it must not be stored for the next
    // six hours — even though the mount waiting on it still gets a list.
    await act(async () => {
      bumpSportsCacheEpoch();
      pending.resolve([competition(17, 'PL')]);
    });

    await waitFor(() => expect(result.current.competitions).toEqual([competition(8, 'La Liga')]));
    expect(read).toHaveBeenCalledTimes(2);
  });
});
