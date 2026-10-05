import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import { useMemo } from 'react';

export function usePlaylistData() {
  const activePlaylistId = usePlaylistStore((state) => state.activePlaylistId);
  const playlists = usePlaylistStore((state) => state.playlists);
  const isInitialized = usePlaylistStore((state) => state.isInitialized);

  const activePlaylist = useMemo(() => {
    if (!activePlaylistId) return null;
    return playlists.find((p) => p.id === activePlaylistId) || null;
  }, [activePlaylistId, playlists]);

  return {
    activePlaylist,
    /**
     * Whether the playlists have been read from the database at least once.
     *
     * Derived from `isInitialized`, not from `isLoading`: the latter is still
     * false before `loadPlaylists` starts, so a cold start would briefly claim
     * the playlists had loaded and flash "No Active Playlist". A later reload
     * keeps this true, so a refresh doesn't tear the screen down.
     */
    hasLoadedPlaylist: isInitialized,
    isLoadingPlaylist: !isInitialized,
  };
}
