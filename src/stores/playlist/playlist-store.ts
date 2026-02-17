import { create } from 'zustand';
import type {
  Playlist,
  CreatePlaylistInput,
  UpdatePlaylistInput,
} from '@/types/playlist.types';
import { PlaylistService } from '@/services/playlist-service';
import { EpgService } from '@/services/epg-service';
import { RustChannelService } from '@/services/rust-channel-service';
import { playlistRepository } from '@/db/playlist-repository';
import { generatePlaylistId, sanitizePlaylistName } from '@/lib/playlist-utils';

interface PlaylistState {
  playlists: Playlist[];
  activePlaylistId: string | null;

  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  initError: string | null;

  addPlaylist: (input: CreatePlaylistInput) => Promise<void>;
  removePlaylist: (id: string) => Promise<void>;
  setActivePlaylist: (id: string | null) => Promise<void>;
  refreshPlaylist: (id: string) => Promise<void>;
  updatePlaylist: (id: string, updates: UpdatePlaylistInput) => Promise<void>;
  loadPlaylists: () => Promise<void>;

  getActivePlaylist: () => Playlist | null;
  getPlaylistById: (id: string) => Playlist | null;
}
export const usePlaylistStore = create<PlaylistState>((set, get) => ({
  playlists: [],
  activePlaylistId: null,

  isInitialized: false,
  isLoading: false,
  error: null,
  initError: null,

  addPlaylist: async (input: CreatePlaylistInput) => {
    console.log('[PlaylistStore] addPlaylist called with:', {
      name: input.name,
      hasCredentials: !!input.credentials,
    });
    // DEBUG: Log full URL to trace potential corruption
    console.log('[PlaylistStore] addPlaylist - FULL URL:', input.url);

    if (!input.name?.trim()) {
      console.error('[PlaylistStore] Validation failed: name is empty');
      const error = new Error('Playlist name is required');
      set({ error: error.message });
      throw error;
    }

    if (!input.url?.trim()) {
      console.error('[PlaylistStore] Validation failed: URL is empty');
      const error = new Error('Playlist URL is required');
      set({ error: error.message });
      throw error;
    }

    set({ isLoading: true, error: null });
    console.log('[PlaylistStore] Set loading state to true');

    try {
      console.log('[PlaylistStore] Validating URL...');
      if (!PlaylistService.validateUrl(input.url)) {
        throw new Error('Invalid URL format');
      }

      console.log('[PlaylistStore] Checking for duplicates...');
      const { useUserStore } = await import('../user/user-store');
      const currentUserId = useUserStore.getState().currentUser?.id;
      const existingPlaylist = get().playlists.find(
        (p) => p.url.toLowerCase() === input.url.toLowerCase() && p.createdByUserId === currentUserId
      );
      if (existingPlaylist) {
        throw new Error(`Playlist from this URL already exists: "${existingPlaylist.name}"`);
      }

      const playlistId = generatePlaylistId();
      const playlistName = sanitizePlaylistName(input.name);

      console.log('[PlaylistStore] Fetching and importing playlist via Rust...');
      const importStart = Date.now();
      const channelCount = await RustChannelService.fetchAndImportPlaylist(
        playlistId,
        playlistName,
        input.url,
        input.credentials
      );
      console.log(`[PlaylistStore] Playlist imported: ${channelCount} channels (${Date.now() - importStart}ms)`);

      if (channelCount === 0) {
        throw new Error('No channels found in playlist. Please verify the M3U format.');
      }

      const now = new Date();
      const playlist: Playlist = {
        id: playlistId,
        name: playlistName,
        url: input.url.trim(),
        epgUrl: input.epgUrl?.trim() || undefined,
        credentials: input.credentials,
        // parsedData is no longer stored - channels live in Rust DB
        channelCount,
        createdByUserId: currentUserId,
        createdAt: now,
        updatedAt: now,
        lastFetchedAt: now,
      };

      console.log('[PlaylistStore] Creating playlist in repository:', {
        id: playlist.id,
        name: playlist.name,
        channelCount: playlist.channelCount,
      });

      await playlistRepository.create(playlist);
      console.log('[PlaylistStore] Playlist saved to repository');

      // Fire-and-forget: detect and fetch EPG data
      EpgService.detectAndFetchEpgSources(playlistId, playlist.epgUrl).catch((err) => {
        console.warn('[PlaylistStore] EPG auto-import failed:', err);
      });

      set((state) => ({
        playlists: [...state.playlists, playlist],
        isLoading: false,
        error: null,
        activePlaylistId: state.playlists.length === 0 ? playlist.id : state.activePlaylistId,
      }));

      console.log('[PlaylistStore] State updated successfully, total playlists:', get().playlists.length);
    } catch (error) {
      console.error('[PlaylistStore] Error in addPlaylist:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to add playlist';
      console.error('[PlaylistStore] Setting error state:', errorMessage);
      set({ error: errorMessage, isLoading: false });
      throw error;
    }
  },

  removePlaylist: async (id: string) => {
    if (!id) {
      const error = new Error('Playlist ID is required');
      set({ error: error.message });
      throw error;
    }

    set({ isLoading: true, error: null });

    try {
      // Delete from both JS repository and Rust database
      await playlistRepository.delete(id);
      await RustChannelService.deletePlaylist(id);

      set((state) => ({
        playlists: state.playlists.filter((p) => p.id !== id),
        activePlaylistId:
          state.activePlaylistId === id
            ? state.playlists.find((p) => p.id !== id)?.id ?? null
            : state.activePlaylistId,
        isLoading: false,
        error: null,
      }));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to remove playlist';
      set({ error: errorMessage, isLoading: false });
      throw error;
    }
  },

  setActivePlaylist: async (id: string | null) => {
    if (id !== null) {
      const playlist = get().playlists.find((p) => p.id === id);
      if (!playlist) {
        set({ error: 'Playlist not found' });
        return;
      }
    }

    set({ activePlaylistId: id, error: null });

    // Also save to current user's settings
    const { useUserStore } = await import('../user/user-store');
    const currentUser = useUserStore.getState().currentUser;
    if (currentUser) {
      try {
        await useUserStore.getState().updateSettings(currentUser.id, { activePlaylistId: id || undefined });
      } catch (error) {
        console.error('[PlaylistStore] Failed to save active playlist to user settings:', error);
      }
    }
  },

  refreshPlaylist: async (id: string) => {
    set({ isLoading: true, error: null });

    try {
      const playlist = get().getPlaylistById(id);
      if (!playlist) {
        throw new Error('Playlist not found');
      }

      console.log('[PlaylistStore] Refreshing playlist via Rust:', id);
      const importStart = Date.now();
      const channelCount = await RustChannelService.fetchAndImportPlaylist(
        id,
        playlist.name,
        playlist.url,
        playlist.credentials
      );
      console.log(`[PlaylistStore] Refresh imported: ${channelCount} channels (${Date.now() - importStart}ms)`);

      if (channelCount === 0) {
        throw new Error('No channels found in playlist. Please verify the M3U format.');
      }

      // Fire-and-forget: detect and fetch EPG data
      EpgService.detectAndFetchEpgSources(id, playlist.epgUrl).catch((err) => {
        console.warn('[PlaylistStore] EPG auto-import failed:', err);
      });

      const updated = await playlistRepository.update(id, {
        channelCount,
        lastFetchedAt: new Date(),
      });

      set((state) => ({
        playlists: state.playlists.map((p) => (p.id === id ? updated : p)),
        isLoading: false,
      }));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to refresh playlist';
      set({ error: errorMessage, isLoading: false });
      throw error;
    }
  },

  updatePlaylist: async (id: string, updates: UpdatePlaylistInput) => {
    set({ isLoading: true, error: null });

    try {
      let channelCount: number | undefined;
      let lastFetchedAt: Date | undefined;

      const playlist = get().getPlaylistById(id);
      if (!playlist) {
        throw new Error('Playlist not found');
      }

      if (updates.url || updates.credentials) {
        const newUrl = updates.url || playlist.url;
        const newCredentials = updates.credentials || playlist.credentials;

        if (updates.url && !PlaylistService.validateUrl(updates.url)) {
          throw new Error('Invalid URL format');
        }

        console.log('[PlaylistStore] Re-fetching playlist via Rust:', id);
        const importStart = Date.now();
        channelCount = await RustChannelService.fetchAndImportPlaylist(
          id,
          updates.name ? sanitizePlaylistName(updates.name) : playlist.name,
          newUrl,
          newCredentials
        );
        console.log(`[PlaylistStore] Update imported: ${channelCount} channels (${Date.now() - importStart}ms)`);

        if (channelCount === 0) {
          throw new Error('No channels found in playlist. Please verify the M3U format.');
        }

        lastFetchedAt = new Date();
      }

      // Resolve the effective epgUrl (updated value takes priority)
      const effectiveEpgUrl = updates.epgUrl !== undefined ? updates.epgUrl : playlist.epgUrl;

      // Fire-and-forget: detect and fetch EPG data if URL/credentials changed or epgUrl was updated
      if (updates.url || updates.credentials || updates.epgUrl !== undefined) {
        EpgService.detectAndFetchEpgSources(id, effectiveEpgUrl || undefined).catch((err) => {
          console.warn('[PlaylistStore] EPG auto-import failed:', err);
        });
      }

      const updateData: Partial<Playlist> = {
        ...updates,
        ...(updates.name && { name: sanitizePlaylistName(updates.name) }),
        ...(channelCount !== undefined && { channelCount }),
        ...(lastFetchedAt && { lastFetchedAt }),
      };

      const updated = await playlistRepository.update(id, updateData);

      set((state) => ({
        playlists: state.playlists.map((p) => (p.id === id ? updated : p)),
        isLoading: false,
      }));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to update playlist';
      set({ error: errorMessage, isLoading: false });
      throw error;
    }
  },

  loadPlaylists: async () => {
    set({ isLoading: true, error: null });

    try {
      // Load playlists visible to the current user based on sharing settings
      const { useUserStore } = await import('../user/user-store');
      const currentUser = useUserStore.getState().currentUser;
      const sharingEnabled = currentUser?.settings?.playlistSharingEnabled ?? true;
      const playlists = currentUser
        ? await playlistRepository.getVisiblePlaylists(currentUser.id, sharingEnabled)
        : await playlistRepository.getAll();

      // Load active playlist from current user's settings
      let activePlaylistId: string | null = null;
      try {
        if (currentUser?.settings?.activePlaylistId) {
          // Check if the saved playlist still exists
          const savedPlaylist = playlists.find(p => p.id === currentUser.settings?.activePlaylistId);
          if (savedPlaylist) {
            activePlaylistId = currentUser.settings.activePlaylistId;
          }
        }
      } catch (error) {
        console.error('[PlaylistStore] Failed to load active playlist from user settings:', error);
      }

      // Auto-select first playlist if none is active
      if (!activePlaylistId && playlists.length > 0) {
        activePlaylistId = playlists[0].id;
      }

      set({
        playlists,
        activePlaylistId,
        isInitialized: true,
        isLoading: false,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to load playlists';
      set({ error: errorMessage, isInitialized: true, isLoading: false });
      throw error;
    }
  },

  getActivePlaylist: () => {
    const state = get();
    if (!state.activePlaylistId) return null;
    return state.playlists.find((p) => p.id === state.activePlaylistId) || null;
  },

  getPlaylistById: (id: string) => {
    const state = get();
    return state.playlists.find((p) => p.id === id) || null;
  },
}));
