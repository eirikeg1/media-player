import { useEffect } from 'react';
import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import { useUserStore } from '@/stores/user/user-store';
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
      } catch (error) {
        console.error('[App] Failed to initialize app:', error);
      }
    };

    init();
  }, [loadPlaylists, loadUsers]);
}
