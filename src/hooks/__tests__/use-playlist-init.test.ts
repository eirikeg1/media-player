/**
 * The boot sequence is memoised for the life of the process (`initPromise`), so
 * this suite runs it exactly once — jest gives each file its own module
 * registry, which is what makes one run per file the natural unit.
 */
import { userRepository } from '@/db/user-repository';
import {
  __resetSportsLaunchState,
  getSportsWarmPromise,
} from '@/features/sports/background/foreground-refresh';
import { runInit } from '@/hooks/use-playlist-init';
import { getSportsDatabase } from '@/services/sports-service';
import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import { useUserStore } from '@/stores/user/user-store';
import { resetTestDatabases } from '@/test/helpers';
import type { FixtureWindow } from 'expo-m3u-parser';

it("starts today's sports warm during start-up without waiting for it", async () => {
  await resetTestDatabases();
  __resetSportsLaunchState();
  await userRepository.createUser({ username: 'Eirik' });

  // A warm that never comes back: if the sequence awaited it, nothing below
  // would ever run and the loading screen would sit on a provider request.
  const sportsDb = await getSportsDatabase();
  let release!: (window: FixtureWindow) => void;
  const day = jest
    .spyOn(sportsDb, 'getFixturesForWindow')
    .mockReturnValue(new Promise<FixtureWindow>((resolve) => (release = resolve)));

  await runInit();

  // The sequence ran to the end — users loaded, playlists initialized.
  expect(useUserStore.getState().currentUser).not.toBeNull();
  expect(usePlaylistStore.getState().isInitialized).toBe(true);
  expect(usePlaylistStore.getState().initError).toBeNull();

  // ...while today's schedule was already on its way.
  expect(day).toHaveBeenCalledTimes(1);
  expect(getSportsWarmPromise()).not.toBeNull();

  release({ fixtures: [], stale: false });
  await getSportsWarmPromise();
});
