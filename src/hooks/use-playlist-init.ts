import { useEffect } from 'react';
import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import { useUserStore } from '@/stores/user/user-store';
import { useFirstPageCacheStore } from '@/stores/cache';
import { initializeDatabase } from '@/db/migrations';

/**
 * Hook to initialize the database, users, and playlists on app load
 * This sets up the SQLite database schema and loads stored data
 */
export function usePlaylistInit() {
  const loadPlaylists = usePlaylistStore((state) => state.loadPlaylists);
  const loadUsers = useUserStore((state) => state.loadUsers);

  useEffect(() => {
    const init = async () => {
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
        const excludeAdult = currentUser?.settings?.parentalControlEnabled ?? false;

        // Load favorites before pre-fetching so cached pages have correct sort order
        if (currentUser) {
          console.log('[App] Loading favorite channels...');
          await useUserStore.getState().loadFavoriteChannels(currentUser.id);
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
        // Error is logged; splash timeout will ensure app remains usable
      }
    };

    init();
  }, [loadPlaylists, loadUsers]);
}
