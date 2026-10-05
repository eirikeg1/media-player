import { useEffect } from 'react';
import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import { selectExcludeAdult, useUserStore } from '@/stores/user/user-store';
import { useFirstPageCacheStore } from '@/stores/cache';
import { initializeDatabase, migrateLegacyChannelIds } from '@/db/migrations';
import { startSportsLaunchWarm } from '@/features/sports/background/foreground-refresh';

/**
 * Boot sequence, in the order the steps depend on each other:
 *
 * 1. migrations — nothing may query before the schema is current, and the
 *    one-time channel-id remap has to land before anything reads data keyed on
 *    a channel id;
 * 2. users — the playlists that are visible and the active one depend on who is
 *    signed in;
 * 3. the current user's data (favourites, reactions, header backgrounds), which
 *    has to be in place before any screen renders, because `loadPlaylists`
 *    flips `isInitialized` and that is what releases the UI;
 * 4. playlists;
 * 5. first-page pre-fetch — including the home page's own rows — which needs
 *    both the active playlist and the user's favourites and reactions (they
 *    affect sort order and the recommendations).
 *
 * Crash recovery (closing orphaned viewing sessions) is deliberately *not* here
 * — see `use-deferred-startup-work`.
 */
async function runInitSequence(): Promise<void> {
  try {
    console.log('[App] Initializing database...');
    await initializeDatabase();
    console.log('[App] Database initialized successfully');

    // Deliberately not fatal: without the remap the app still runs, only with
    // history and favourites orphaned for renamed VOD entries, and nothing is
    // recorded so the next launch tries again. Failing the boot sequence over
    // it would leave the user staring at an error screen instead.
    try {
      await migrateLegacyChannelIds();
    } catch (error) {
      console.error('[App] Channel id remap failed; retrying on next launch:', error);
    }

    console.log('[App] Loading users...');
    await useUserStore.getState().loadUsers();
    console.log('[App] Users loaded successfully');

    const currentUser = useUserStore.getState().currentUser;
    if (currentUser) {
      console.log('[App] Hydrating current user...');
      await useUserStore.getState().hydrateForUser(currentUser.id);
    }

    // Today's schedule is ~10 paced requests to a host nothing else here
    // touches, so it rides along with the playlist work below rather than
    // starting seconds after the loading screen has gone — by which time the
    // user is already looking at the sports skeleton. Deliberately not
    // awaited: the steps below must not queue behind a provider. Readiness
    // joins it separately, with its own short deadline.
    startSportsLaunchWarm(currentUser);

    console.log('[App] Loading playlists...');
    await usePlaylistStore.getState().loadPlaylists();
    console.log('[App] Playlists loaded successfully');

    const activePlaylistId = usePlaylistStore.getState().activePlaylistId;
    if (activePlaylistId) {
      console.log('[App] Pre-fetching first pages...');
      const { favoriteChannels, contentReactions, recentlyWatchedVersion } =
        useUserStore.getState();
      await useFirstPageCacheStore.getState().preFetchAll(
        activePlaylistId,
        selectExcludeAdult(currentUser),
        favoriteChannels,
        // The home page's own rows: the landing screen's first data has to be
        // in hand before the loading screen drops, not fetched behind it.
        currentUser
          ? { userId: currentUser.id, reactions: contentReactions, recentlyWatchedVersion }
          : undefined,
      );
      console.log('[App] First pages pre-fetched successfully');
    }
  } catch (error) {
    console.error('[App] Failed to initialize app:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    // Force stores out of loading state so navigation can proceed, but record the error
    usePlaylistStore.setState({ isInitialized: true, initError: message });
    useUserStore.setState({ isLoading: false });
  }
}

// Initialization runs once per app process: every caller shares this promise,
// and `retryInit` replaces it only after the previous run has settled.
let initPromise: Promise<void> | null = null;
let retryPromise: Promise<void> | null = null;

/** Start (or join) app initialization. */
export function runInit(): Promise<void> {
  initPromise ??= runInitSequence();
  return initPromise;
}

/**
 * Retry initialization after a failure.
 *
 * Waits for the run in flight to settle before starting a new one, so two
 * sequences can never interleave their writes to the same stores. Concurrent
 * callers (an impatient double-tap on "Tap to Retry") join the pending retry.
 */
export function retryInit(): Promise<void> {
  if (retryPromise) return retryPromise;

  retryPromise = (async () => {
    try {
      await runInit();
      usePlaylistStore.setState({ initError: null, isInitialized: false });
      useUserStore.setState({ isLoading: true, error: null });
      initPromise = runInitSequence();
      await initPromise;
    } finally {
      retryPromise = null;
    }
  })();

  return retryPromise;
}

/**
 * Hook to initialize the database, users, and playlists on app load.
 * This sets up the SQLite database schema and loads stored data.
 * Call once in the root layout.
 */
export function usePlaylistInit() {
  useEffect(() => {
    // Idempotent: repeated mounts join the one initialization promise.
    void runInit();
  }, []);
}
