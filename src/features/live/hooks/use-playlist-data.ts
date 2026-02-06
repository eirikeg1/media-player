import { usePlaylistStore } from '@/states/playlist/playlist-store';
import { useMemo } from 'react';

export function usePlaylistData() {
  const activePlaylistId = usePlaylistStore((state) => state.activePlaylistId);
  const playlists = usePlaylistStore((state) => state.playlists);
  const isLoading = usePlaylistStore((state) => state.isLoading);

  const activePlaylist = useMemo(() => {
    if (!activePlaylistId) return null;
    return playlists.find((p) => p.id === activePlaylistId) || null;
  }, [activePlaylistId, playlists]);

  return {
    activePlaylist,
    hasLoadedPlaylist: !isLoading,
    isLoadingPlaylist: isLoading,
  };
}