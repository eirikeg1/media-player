import { create } from 'zustand';
import type {
  Playlist,
  CreatePlaylistInput,
  PlaylistCredentials,
  UpdatePlaylistInput,
} from '@/types/playlist.types';
import { EpgService, isEpgFetchComplete } from '@/services/epg-service';
import { RustChannelService } from '@/services/rust-channel-service';
import { playlistRepository } from '@/db/playlist-repository';
import { generatePlaylistId, sanitizePlaylistName } from '@/lib/playlist-utils';
import { isValidUrl, redactCredentials } from '@/lib/url-utils';
import { M3uParserError, addImportProgressListener } from 'expo-m3u-parser';
import { useFirstPageCacheStore } from '@/stores/cache/first-page-cache-store';
import { isImportRunning, useImportProgressStore } from './import-progress-store';

const NO_CHANNELS_MESSAGE = 'No channels found in playlist. Please verify the M3U format.';

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

/**
 * Raised when the native backend is already importing the playlist we asked it
 * to import — a duplicate request, not a failure of the running import.
 */
export class ImportAlreadyRunningError extends Error {
  constructor() {
    super('This playlist is already being imported. Please wait for it to finish.');
    this.name = 'ImportAlreadyRunningError';
  }
}

/**
 * Whether an error is the native backend refusing a duplicate import.
 *
 * The module classifies its own failures, so the code decides it. The message
 * match stays as a fallback for an error that reached us without one — an older
 * native build, or a rejection raised before the coded path.
 */
function isAlreadyInProgress(error: unknown): boolean {
  if (error instanceof M3uParserError && error.code) return error.code === 'ALREADY_IN_PROGRESS';
  const message = error instanceof Error ? error.message : String(error);
  return /already in progress|already running|AlreadyInProgress/i.test(message);
}

/** Everything a fetch-and-import needs, whether it adds, refreshes or edits. */
interface ImportRequest {
  playlistId: string;
  name: string;
  url: string;
  credentials?: PlaylistCredentials;
}

/**
 * Run one playlist import, owning its progress lifecycle end to end.
 *
 * The progress entry is started before the native call and removed once the
 * import settles — including on failure, so a broken import can never leave a
 * card stuck "importing" and make the scheduler skip it forever.
 *
 * A call that finds an entry already there joins a run someone else is tracking:
 * it neither resets that run's progress nor removes its entry, because the entry
 * belongs to the caller that created it.
 *
 * @throws ImportAlreadyRunningError when an import for this playlist is already running
 * @throws Error when the download fails or the playlist yields no channels
 */
async function runImport({ playlistId, name, url, credentials }: ImportRequest): Promise<number> {
  const progress = () => useImportProgressStore.getState();

  console.log('[PlaylistStore] Importing playlist:', playlistId, redactCredentials(url));
  const importStart = Date.now();
  const ownsProgress = progress().startImport(playlistId);
  if (ownsProgress) {
    progress().updateProgress(playlistId, 'downloading', 0, 1);
  }

  const progressSubscription = addImportProgressListener((event) => {
    progress().updateProgress(event.playlistId, event.phase, event.current, event.total);
  });

  try {
    const channelCount = await RustChannelService.fetchAndImportPlaylist(
      playlistId,
      name,
      url,
      credentials,
    );
    if (channelCount === 0) {
      throw new Error(NO_CHANNELS_MESSAGE);
    }

    console.log(
      `[PlaylistStore] Imported ${channelCount} channels (${Date.now() - importStart}ms)`,
    );
    progress().updateProgress(playlistId, 'complete', 1, 1);
    if (ownsProgress) progress().finishImport(playlistId);
    return channelCount;
  } catch (error) {
    // A duplicate rejection means someone else's run is still going: its entry
    // describes that run, so only an entry this call created may be removed —
    // otherwise the running import's progress would vanish from the UI and every
    // gate that reads it would think nothing is importing.
    if (ownsProgress) progress().finishImport(playlistId);
    if (isAlreadyInProgress(error)) {
      throw new ImportAlreadyRunningError();
    }
    throw error;
  } finally {
    progressSubscription.remove();
  }
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
  markEpgFetched: (id: string) => Promise<void>;
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

      const { useUserStore } = await import('../user/user-store');
      const currentUserId = useUserStore.getState().currentUser?.id;
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
      };

      await playlistRepository.create(playlist);
      invalidateFirstPageCache(playlistId);

      set((state) => ({
        playlists: [...state.playlists, playlist],
        error: null,
        activePlaylistId: state.playlists.length === 0 ? playlist.id : state.activePlaylistId,
      }));

      fetchEpgInBackground(playlistId, playlist.epgUrl);
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
    const { useUserStore } = await import('../user/user-store');
    const currentUser = useUserStore.getState().currentUser;
    if (currentUser) {
      try {
        await useUserStore
          .getState()
          .updateSettings(currentUser.id, { activePlaylistId: id || undefined });
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

    const playlist = get().getPlaylistById(id);
    if (!playlist) {
      const error = new Error('Playlist not found');
      if (!silent) set({ error: error.message });
      throw error;
    }

    try {
      const channelCount = await runImport({
        playlistId: id,
        name: playlist.name,
        url: playlist.url,
        credentials: playlist.credentials,
      });

      const updated = await playlistRepository.update(id, {
        channelCount,
        lastFetchedAt: new Date(),
      });
      set((state) => ({
        playlists: state.playlists.map((p) => (p.id === id ? updated : p)),
      }));
      invalidateFirstPageCache(id);

      fetchEpgInBackground(id, playlist.epgUrl);
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
      if (epgUrlChanged) fetchEpgInBackground(id, nextEpgUrl);
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
      applyUpdated(
        await playlistRepository.update(id, {
          url: nextUrl,
          ...(credentialsProvided && { credentials: updates.credentials }),
          channelCount,
          lastFetchedAt: new Date(),
        }),
      );
      invalidateFirstPageCache(id);

      fetchEpgInBackground(id, nextEpgUrl);
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
      const { useUserStore } = await import('../user/user-store');
      const currentUser = useUserStore.getState().currentUser;
      const sharingEnabled = currentUser?.settings?.playlistSharingEnabled ?? true;
      const playlists = currentUser
        ? await playlistRepository.getVisiblePlaylists(currentUser.id, sharingEnabled)
        : await playlistRepository.getAll();

      // Load active playlist from current user's settings: only keep the saved
      // selection while the playlist it names is still visible.
      const savedId = currentUser?.settings?.activePlaylistId;
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

  markEpgFetched: async (id: string) => {
    const lastEpgFetchedAt = new Date();
    await playlistRepository.update(id, { lastEpgFetchedAt });
    set((state) => ({
      playlists: state.playlists.map((p) => (p.id === id ? { ...p, lastEpgFetchedAt } : p)),
    }));
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
 * Fetch EPG data for a playlist without blocking the caller, stamping
 * `lastEpgFetchedAt` only once the guide is as current as its sources allow — a
 * stamp after a failed download would tell the EPG scheduler to wait a full
 * interval before trying again. Every failure is reported: a silently missing
 * guide looks like a bug in the EPG screens instead of a failed download.
 */
function fetchEpgInBackground(playlistId: string, epgUrl?: string): void {
  EpgService.detectAndFetchEpgSources(playlistId, epgUrl)
    .then((result) => {
      if (!isEpgFetchComplete(result)) {
        console.warn(
          `[PlaylistStore] ${result.failed} EPG source(s) failed for ${playlistId}; not recording a fetch time`,
        );
        return;
      }
      return usePlaylistStore
        .getState()
        .markEpgFetched(playlistId)
        .catch((err: unknown) => {
          console.warn('[PlaylistStore] Failed to record lastEpgFetchedAt:', err);
        });
    })
    .catch((err: unknown) => {
      console.warn('[PlaylistStore] EPG auto-import failed:', err);
    });
}
