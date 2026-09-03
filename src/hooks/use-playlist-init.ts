import { useEffect, useRef } from 'react';
import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import { useUserStore } from '@/stores/user/user-store';
import { useHeaderBackgroundStore } from '@/stores/header-background';
import { useFirstPageCacheStore } from '@/stores/cache';
import { initializeDatabase } from '@/db/migrations';
import { ensureRecommendationModelLoaded } from '@/services/recommendation-model';

async function runInit() {
  const loadUsers = useUserStore.getState().loadUsers;
  const loadPlaylists = usePlaylistStore.getState().loadPlaylists;

  // Materialize and load the recommendation taste model alongside the rest of
  // startup. Not awaited: the home page awaits the same memoized promise when
  // it needs the model, and nothing else here depends on it.
  void ensureRecommendationModelLoaded();

  try {
    // Initialize database schema (run migrations)
    console.log('[App] Initializing database...');
    await initializeDatabase();
    console.log('[App] Database initialized successfully');

    // Load users
    console.log('[App] Loading users...');
    await loadUsers();
    console.log('[App] Users loaded successfully');

    // Close any orphaned viewing sessions (crash recovery)
    console.log('[App] Closing orphaned viewing sessions...');
    await useUserStore.getState().closeOrphanedSessions();

    // Load playlists from database
    console.log('[App] Loading playlists...');
    await loadPlaylists();
    console.log('[App] Playlists loaded successfully');

    // Pre-fetch first pages for instant tab switching
    const activePlaylistId = usePlaylistStore.getState().activePlaylistId;
    const currentUser = useUserStore.getState().currentUser;
    const excludeAdult = currentUser?.settings?.parentalControlEnabled ?? true;

    // Load favorites before pre-fetching so cached pages have correct sort order
    if (currentUser) {
      console.log('[App] Loading favorite channels...');
      await useUserStore.getState().loadFavoriteChannels(currentUser.id);

      // Load header background selections
      console.log('[App] Loading header background selections...');
      await useHeaderBackgroundStore.getState().loadSelections(currentUser.id);
    }
    const favoriteChannels = useUserStore.getState().favoriteChannels;

    if (activePlaylistId) {
      console.log('[App] Pre-fetching first pages...');
      await useFirstPageCacheStore.getState().preFetchAll(
        activePlaylistId, excludeAdult, favoriteChannels
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

/**
 * Retry initialization after a failure.
 * Resets error/loading state and re-runs the full init sequence.
 */
export function retryInit() {
  usePlaylistStore.setState({ initError: null, isInitialized: false });
  useUserStore.setState({ isLoading: true });
  runInit();
}

/**
 * Hook to initialize the database, users, and playlists on app load.
 * This sets up the SQLite database schema and loads stored data.
 * Call once in the root layout.
 */
export function usePlaylistInit() {
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;
    runInit();
  }, []);
}
