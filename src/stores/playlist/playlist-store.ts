import { create } from 'zustand';
import type {
  Playlist,
  CreatePlaylistInput,
  PlaylistCredentials,
  UpdatePlaylistInput,
} from '@/types/playlist.types';
import { RustChannelService } from '@/services/rust-channel-service';
import { playlistRepository } from '@/db/playlist-repository';
import { generatePlaylistId, sanitizePlaylistName } from '@/lib/playlist-utils';
import { DEFAULT_EPG_SYNC_MINUTES, DEFAULT_PLAYLIST_SYNC_MINUTES } from '@/lib/sync-intervals';
import { isValidUrl, redactCredentials } from '@/lib/url-utils';
import { useFirstPageCacheStore } from '@/stores/cache/first-page-cache-store';
import { publishCatalogueRefresh, subscribeToCatalogueRefreshes } from './catalogue-events';
import {
  getCurrentUserContext,
  getCurrentUserId,
  persistActivePlaylist,
} from './current-user-context';
import { isImportRunning } from './import-progress-store';
import { syncPlaylistChannels, syncPlaylistGuide } from './playlist-sync';
import { ImportAlreadyRunningError, runImport } from './run-import';

/**
 * The message to store in `error` and log for a failure.
 *
 * Redacted: a native failure quotes the URL it was given, and that URL usually
 * carries the provider account's credentials — `error` is rendered in the UI and
 * printed to the console.
 */
function toErrorMessage(error: unknown, fallback: string): string {
  return redactCredentials(error instanceof Error ? error.message : fallback);
}

/** Drop the cached first page so the next read reflects the new channels. */
function invalidateFirstPageCache(playlistId: string): void {
  useFirstPageCacheStore.getState().invalidatePlaylist(playlistId);
}

/** Whether two credential pairs describe the same account. */
function sameCredentials(a?: PlaylistCredentials, b?: PlaylistCredentials): boolean {
  return (a?.username ?? '') === (b?.username ?? '') && (a?.password ?? '') === (b?.password ?? '');
}

interface PlaylistState {
  playlists: Playlist[];
  activePlaylistId: string | null;

  isInitialized: boolean;
  /** True while the playlist *list* is loading. Imports never set this. */
  isLoading: boolean;
  error: string | null;
  initError: string | null;

  addPlaylist: (input: CreatePlaylistInput) => Promise<void>;
  removePlaylist: (id: string) => Promise<void>;
  setActivePlaylist: (id: string | null) => Promise<void>;
  refreshPlaylist: (id: string, options?: { silent?: boolean }) => Promise<void>;
  updatePlaylist: (id: string, updates: UpdatePlaylistInput) => Promise<void>;
  loadPlaylists: () => Promise<void>;
  clearError: () => void;

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
    if (!input.name?.trim()) {
      const error = new Error('Playlist name is required');
      set({ error: error.message });
      throw error;
    }

    if (!input.url?.trim()) {
      const error = new Error('Playlist URL is required');
      set({ error: error.message });
      throw error;
    }

    set({ error: null });

    try {
      if (!isValidUrl(input.url)) {
        throw new Error('Invalid URL format');
      }

      const currentUserId = getCurrentUserId() ?? undefined;
      const existingPlaylist = get().playlists.find(
        (p) =>
          p.url.toLowerCase() === input.url.toLowerCase() && p.createdByUserId === currentUserId,
      );
      if (existingPlaylist) {
        throw new Error(`Playlist from this URL already exists: "${existingPlaylist.name}"`);
      }

      const playlistId = input.id ?? generatePlaylistId();
      const playlistName = sanitizePlaylistName(input.name);

      const channelCount = await runImport({
        playlistId,
        name: playlistName,
        url: input.url,
        credentials: input.credentials,
      });

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
        // lastEpgFetchedAt is stamped by the EPG fetch below, once it succeeds:
        // claiming it here would make the EPG scheduler skip a playlist whose
        // guide never downloaded.
        // Stored explicitly: a playlist without intervals would never sync on
        // its own, and "unset" is not a choice the user can see or make.
        syncInterval: input.syncInterval ?? DEFAULT_PLAYLIST_SYNC_MINUTES,
        epgSyncInterval: input.epgSyncInterval ?? DEFAULT_EPG_SYNC_MINUTES,
      };

      await playlistRepository.create(playlist);

      set((state) => ({
        playlists: [...state.playlists, playlist],
        error: null,
        activePlaylistId: state.playlists.length === 0 ? playlist.id : state.activePlaylistId,
      }));
      publishCatalogueRefresh({ part: 'channels', playlist });

      fetchEpgInBackground(playlistId);
    } catch (error) {
      const errorMessage = toErrorMessage(error, 'Failed to add playlist');
      console.error('[PlaylistStore] addPlaylist failed:', errorMessage);
      set({ error: errorMessage });
      throw error;
    }
  },

  removePlaylist: async (id: string) => {
    if (!id) {
      const error = new Error('Playlist ID is required');
      set({ error: error.message });
      throw error;
    }

    const removed = get().getPlaylistById(id);
    if (!removed) {
      const error = new Error(`Playlist with id ${id} not found`);
      set({ error: error.message });
      throw error;
    }

    // Deleting a playlist mid-import would race the import's own writes.
    if (isImportRunning(id)) {
      const error = new Error('This playlist is being imported. Please wait for it to finish.');
      set({ error: error.message });
      throw error;
    }

    const previous = { playlists: get().playlists, activePlaylistId: get().activePlaylistId };
    const wasActive = previous.activePlaylistId === id;
    const remaining = previous.playlists.filter((p) => p.id !== id);

    // Optimistically remove from the UI, keeping the order of what remains.
    set({
      playlists: remaining,
      activePlaylistId: wasActive ? (remaining[0]?.id ?? null) : previous.activePlaylistId,
      error: null,
    });

    try {
      // The JS row is what every screen reads, so it is the step allowed to
      // fail: were the channels deleted first, a failure here would leave a
      // playlist on screen whose content is already gone.
      await playlistRepository.delete(id);
    } catch (error) {
      set({ ...previous });
      const errorMessage = toErrorMessage(error, 'Failed to remove playlist');
      set({ error: errorMessage });
      throw error;
    }

    // The row that pointed at these channels is gone, so the delete the user
    // asked for has happened. A failure here only leaves rows behind in the Rust
    // database, which must not resurrect the playlist in the UI.
    try {
      await RustChannelService.deletePlaylist(id);
    } catch (error) {
      console.warn(
        `[PlaylistStore] Playlist ${id} was removed but its channels could not be deleted:`,
        error,
      );
    }

    invalidateFirstPageCache(id);

    // Persist the new selection so the removed id cannot come back on reload.
    if (wasActive) {
      await get().setActivePlaylist(get().activePlaylistId);
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
    const currentUserId = getCurrentUserId();
    if (currentUserId) {
      try {
        await persistActivePlaylist(currentUserId, id);
      } catch (error) {
        console.warn('[PlaylistStore] Failed to save active playlist to user settings:', error);
      }
    }
  },

  refreshPlaylist: async (id: string, options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) {
      set({ error: null });
    }

    try {
      // The shared sync records the import and announces it; the store's copy
      // is patched by the listener at the bottom of this module.
      await syncPlaylistChannels(id);

      // A refresh the user asked for means the whole playlist, guide included —
      // a re-import can also bring guide sources the last download did not know.
      fetchEpgInBackground(id);
    } catch (error) {
      // The original import is still progressing — not a failure to surface.
      if (error instanceof ImportAlreadyRunningError) {
        console.log('[PlaylistStore] Refresh skipped — an import is already running for', id);
        if (silent) return;
        throw error;
      }

      const errorMessage = toErrorMessage(error, 'Failed to refresh playlist');
      if (!silent) {
        set({ error: errorMessage });
      }
      throw error;
    }
  },

  updatePlaylist: async (id: string, updates: UpdatePlaylistInput) => {
    set({ error: null });

    const playlist = get().getPlaylistById(id);
    if (!playlist) {
      const error = new Error('Playlist not found');
      set({ error: error.message });
      throw error;
    }

    if (updates.url !== undefined && !isValidUrl(updates.url)) {
      const error = new Error('Invalid URL format');
      set({ error: error.message });
      throw error;
    }

    // What actually changed decides what has to be re-fetched. An edit that
    // only renames the playlist or retunes its intervals must not re-download
    // tens of thousands of channels.
    const nextUrl = updates.url?.trim() ?? playlist.url;
    const credentialsProvided = 'credentials' in updates;
    const nextCredentials = credentialsProvided ? updates.credentials : playlist.credentials;
    const nextEpgUrl = 'epgUrl' in updates ? updates.epgUrl?.trim() || undefined : playlist.epgUrl;

    const urlChanged = nextUrl !== playlist.url;
    const credentialsChanged =
      credentialsProvided && !sameCredentials(updates.credentials, playlist.credentials);
    const epgUrlChanged = nextEpgUrl !== playlist.epgUrl;
    const nextName = updates.name ? sanitizePlaylistName(updates.name) : playlist.name;
    const sourceChanged = urlChanged || credentialsChanged;

    // An import in flight is writing this playlist's channels right now; moving
    // its source underneath it would leave the two describing different servers.
    if (sourceChanged && isImportRunning(id)) {
      const error = new Error('This playlist is being imported. Please wait for it to finish.');
      set({ error: error.message });
      throw error;
    }

    // Everything that does not describe the source is persisted first, so a
    // failed re-import cannot discard a rename or a retuned interval.
    const { syncInterval, epgSyncInterval } = updates;
    const metadata: Partial<Playlist> = {
      name: nextName,
      ...('epgUrl' in updates && { epgUrl: nextEpgUrl }),
      ...(syncInterval !== undefined && { syncInterval: syncInterval ?? undefined }),
      ...(epgSyncInterval !== undefined && { epgSyncInterval: epgSyncInterval ?? undefined }),
    };

    const applyUpdated = (updated: Playlist) =>
      set((state) => ({
        playlists: state.playlists.map((p) => (p.id === id ? updated : p)),
      }));

    try {
      applyUpdated(await playlistRepository.update(id, metadata));
    } catch (error) {
      const errorMessage = toErrorMessage(error, 'Failed to update playlist');
      set({ error: errorMessage });
      throw error;
    }

    if (!sourceChanged) {
      if (epgUrlChanged) fetchEpgInBackground(id);
      return;
    }

    try {
      const channelCount = await runImport({
        playlistId: id,
        name: nextName,
        url: nextUrl,
        credentials: nextCredentials,
      });

      // The new source is stored only now: a URL (or credential pair) persisted
      // before its import succeeded would describe channels the database does
      // not have, and every later refresh would fetch from a server the user
      // never got a working import from.
      const updated = await playlistRepository.update(id, {
        url: nextUrl,
        ...(credentialsProvided && { credentials: updates.credentials }),
        channelCount,
        lastFetchedAt: new Date(),
      });
      publishCatalogueRefresh({ part: 'channels', playlist: updated });

      fetchEpgInBackground(id);
    } catch (error) {
      const errorMessage = toErrorMessage(error, 'Failed to update playlist');
      set({ error: errorMessage });
      throw error;
    }
  },

  loadPlaylists: async () => {
    set({ isLoading: true, error: null });

    try {
      // Load playlists visible to the current user based on sharing settings
      const currentUser = await getCurrentUserContext();
      const playlists = currentUser
        ? await playlistRepository.getVisiblePlaylists(
            currentUser.userId,
            currentUser.playlistSharingEnabled,
          )
        : await playlistRepository.getAll();

      // Load active playlist from current user's settings: only keep the saved
      // selection while the playlist it names is still visible.
      const savedId = currentUser?.activePlaylistId;
      let activePlaylistId: string | null =
        savedId && playlists.some((p) => p.id === savedId) ? savedId : null;

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
      const errorMessage = toErrorMessage(error, 'Failed to load playlists');
      set({ error: errorMessage, isInitialized: true, isLoading: false });
      throw error;
    }
  },

  clearError: () => set({ error: null }),

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

/**
 * Fetch EPG data for a playlist without blocking the caller. The shared guide
 * sync stamps `lastEpgFetchedAt` only once the guide is as current as its
 * sources allow; every failure is reported here, because a silently missing
 * guide looks like a bug in the EPG screens instead of a failed download.
 */
function fetchEpgInBackground(playlistId: string): void {
  syncPlaylistGuide(playlistId).catch((err: unknown) => {
    console.warn(`[PlaylistStore] EPG auto-import failed for ${playlistId}; not recording a fetch time:`, err);
  });
}

/**
 * Keep the store's copy of a playlist in step with every catalogue refresh,
 * whichever path made it — the store's own actions, the schedulers or the OS
 * background task — and drop the first page cached from the old channels.
 *
 * A process with no initialised store (a headless background launch) has no
 * copy to patch; the next `loadPlaylists` reads the stamps from the row.
 */
subscribeToCatalogueRefreshes(({ part, playlist }) => {
  if (part === 'channels') invalidateFirstPageCache(playlist.id);
  const { playlists } = usePlaylistStore.getState();
  if (!playlists.some((p) => p.id === playlist.id)) return;
  usePlaylistStore.setState({
    playlists: playlists.map((p) => (p.id === playlist.id ? playlist : p)),
  });
});
