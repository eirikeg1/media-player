import type { RecentlyWatchedOptions } from '@/db/user-repository';
import { userRepository } from '@/db/user-repository';
import { getChannelId } from '@/lib/channel-utils';
import { getSeriesNameForChannel, sortEpisodes } from '@/lib/series-utils';
import { RustChannelService } from '@/services/rust-channel-service';
import { useFirstPageCacheStore } from '@/stores/cache';
import { useHeaderBackgroundStore } from '@/stores/header-background';
import {
  setCurrentUserId,
  subscribeToPersistedUserSettings,
} from '@/stores/playlist/current-user-context';
import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import type {
  ContentReactionValue,
  ContentType,
  ContinueWatchingItem,
  CreateUserInput,
  RecentlyWatchedItem,
  UpdateUserInput,
  User,
  UserSettings,
  ViewingSession,
  WatchedContent,
} from '@/types/user.types';
import type { Channel } from '@/types/playlist.types';
import { create } from 'zustand';

/**
 * Whether adult content must be filtered out for a user.
 *
 * Fails closed: with no user, or with settings that have not loaded yet, adult
 * content is excluded. A query that runs a moment too early must never be the
 * reason such content appears — the opposite mistake (hiding it for an instant
 * from a user who allows it) costs nothing.
 */
export function selectExcludeAdult(user: User | null | undefined): boolean {
  return user?.settings?.parentalControlEnabled ?? true;
}

/**
 * The user to restore on launch: the one who used the app last. `lastActiveAt`
 * is null for users created before it was recorded, so `createdAt` stands in.
 */
function pickMostRecentlyActive(users: User[]): User | null {
  const lastSeen = (user: User) => (user.lastActiveAt ?? user.createdAt).getTime();
  return users.reduce<User | null>(
    (best, user) => (best === null || lastSeen(user) > lastSeen(best) ? user : best),
    null,
  );
}

interface UserState {
  // State
  users: User[];
  currentUser: User | null;
  isLoading: boolean;
  error: string | null;
  favoriteChannels: string[];
  contentReactions: Record<string, ContentReactionValue>;
  recentlyWatchedVersion: number;

  // User management actions
  loadUsers: () => Promise<void>;
  hydrateForUser: (userId: string) => Promise<void>;
  createUser: (input: CreateUserInput) => Promise<User>;
  switchUser: (userId: string) => Promise<void>;
  updateUser: (userId: string, updates: UpdateUserInput) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;

  // Settings actions
  updateSettings: (userId: string, settings: Partial<UserSettings>) => Promise<void>;

  // Favorite channels actions
  loadFavoriteChannels: (userId: string) => Promise<void>;
  toggleFavorite: (userId: string, channelId: string) => Promise<void>;

  // Content reactions actions (like/dislike on movies/series)
  loadContentReactions: (userId: string) => Promise<void>;
  setReaction: (userId: string, channelId: string, reaction: ContentReactionValue | null) => Promise<void>;

  // Viewing history actions
  activeSessionId: string | null;
  startViewingSession: (params: {
    userId: string;
    playlistId: string;
    channelId: string;
    channelName: string;
    groupTitle?: string;
    contentType: ContentType;
    tvgLogo?: string;
    startPosition?: number;
    totalDuration?: number;
  }) => Promise<string>;
  updateSessionProgress: (sessionId: string, endPosition: number, durationWatched: number, totalDuration?: number) => Promise<void>;
  endViewingSession: (sessionId: string, endPosition: number, durationWatched: number, completed: boolean) => Promise<void>;
  getContinueWatching: (userId: string, playlistId: string, limit?: number) => Promise<ContinueWatchingItem[]>;
  getRecentlyWatched: (
    userId: string,
    playlistId: string,
    limit?: number,
    options?: RecentlyWatchedOptions,
  ) => Promise<RecentlyWatchedItem[]>;
  getWatchStatsForChannels: (
    userId: string,
    playlistId: string,
    channelIds: string[],
  ) => Promise<RecentlyWatchedItem | null>;
  getWatchedContent: (userId: string, playlistId: string) => Promise<WatchedContent>;
  getViewingHistory: (userId: string, limit?: number) => Promise<ViewingSession[]>;
  clearViewingHistory: (userId: string) => Promise<void>;
  closeOrphanedSessions: () => Promise<void>;
  getSavedPosition: (userId: string, playlistId: string, channelId: string) => Promise<{ lastPosition: number; totalDuration?: number } | null>;
  resolveAndStoreNextEpisode: (userId: string, playlistId: string, channel: Channel) => Promise<void>;

  // Utility actions
  clearError: () => void;

  // Favorite groups actions
  getFavoriteGroups: (userId: string) => Promise<string[]>;
  toggleFavoriteGroup: (userId: string, groupName: string) => Promise<void>;
}

/**
 * Guards against a stale hydration finishing after a newer one: every load of
 * per-user state takes the next token and only writes if it is still the latest,
 * so a fast switch back and forth cannot leave another user's favourites on
 * screen.
 */
let hydrationGeneration = 0;

/**
 * The switch in flight, if any. Switching is a sequence of dependent writes
 * (current user, their data, their playlists, the caches built from both), so
 * two of them running at once would interleave into a state belonging to
 * neither user. A repeat of the switch already running joins it; a switch to
 * somebody else waits for it and then runs, last request winning.
 */
let switchInFlight: { userId: string; promise: Promise<void> } | null = null;

/**
 * Adopt `user` as the current one: reload the playlists visible to them and drop
 * the cached pages built for whoever came before (favourites and the adult
 * filter are part of what those pages were built from).
 */
async function adoptCurrentUser(user: User | null, favoriteChannels: string[]): Promise<void> {
  const previousPlaylistId = usePlaylistStore.getState().activePlaylistId;

  try {
    await usePlaylistStore.getState().loadPlaylists();
  } catch (error) {
    console.error('[UserStore] Failed to reload playlists for the current user:', error);
  }

  const cache = useFirstPageCacheStore.getState();
  const activePlaylistId = usePlaylistStore.getState().activePlaylistId;
  for (const playlistId of new Set([previousPlaylistId, activePlaylistId])) {
    if (playlistId) cache.invalidatePlaylist(playlistId);
  }
  if (activePlaylistId) {
    const { contentReactions, recentlyWatchedVersion } = useUserStore.getState();
    await cache.preFetchAll(
      activePlaylistId,
      selectExcludeAdult(user),
      favoriteChannels,
      // The home page is as much this user's as the catalogue pages are: the
      // rows the previous user left behind were dropped with their playlist.
      user ? { userId: user.id, reactions: contentReactions, recentlyWatchedVersion } : undefined,
    );
  }
}

/**
 * Error contract for this store:
 * - `load*`/`hydrate*` actions record the failure in `error` (and log it) but
 *   resolve: a screen that cannot show favourites is still usable.
 * - Mutating actions (create/switch/update/delete, toggles, settings) throw, so
 *   the caller can roll back its own state and tell the user.
 */
export const useUserStore = create<UserState>((set, get) => ({
  // Initial state
  users: [],
  currentUser: null,
  isLoading: true, // Start as true until users are loaded
  error: null,
  favoriteChannels: [],
  contentReactions: {},
  activeSessionId: null,
  recentlyWatchedVersion: 0,

  // Load all users from database
  loadUsers: async () => {
    console.log('[UserStore] loadUsers called');
    set({ isLoading: true, error: null });

    try {
      const users = await userRepository.getAllUsers();
      console.log('[UserStore] Loaded users:', users.length);

      set({
        users,
        currentUser: pickMostRecentlyActive(users),
        isLoading: false,
      });

      // Favorite channels, reactions and header backgrounds are hydrated by the
      // caller (see runInit in use-playlist-init), which needs them awaited
      // before the UI is allowed to read them.
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load users';
      console.error('[UserStore] Error loading users:', errorMessage);
      set({ error: errorMessage, isLoading: false });
      throw error;
    }
  },

  /**
   * Load everything that belongs to one user: favourites, reactions and header
   * backgrounds. The previous user's values are cleared first so nothing of
   * theirs can be rendered while the new values load.
   */
  hydrateForUser: async (userId: string) => {
    const generation = ++hydrationGeneration;
    set({ favoriteChannels: [], contentReactions: {}, activeSessionId: null });

    try {
      const [favorites, reactions] = await Promise.all([
        userRepository.getFavoriteChannels(userId),
        userRepository.getContentReactions(userId),
        // Owns its own state, its own error handling and its own staleness
        // guard, so it is only awaited here to keep hydration a single "the
        // user is ready" step.
        useHeaderBackgroundStore.getState().loadSelections(userId),
      ] as const);

      if (generation !== hydrationGeneration) return;

      const contentReactions: Record<string, ContentReactionValue> = {};
      for (const { channelId, reaction } of reactions) {
        contentReactions[channelId] = reaction;
      }

      set({ favoriteChannels: favorites, contentReactions });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load user data';
      console.error('[UserStore] Error hydrating user:', errorMessage);
      if (generation === hydrationGeneration) set({ error: errorMessage });
    }
  },

  // Create a new user
  createUser: async (input: CreateUserInput) => {
    console.log('[UserStore] createUser called:', input.username);
    set({ isLoading: true, error: null });

    try {
      const { users } = get();

      const newUser = await userRepository.createUser(input);
      console.log('[UserStore] User created:', newUser.id);

      const updatedUsers = [...users, newUser];
      set({
        users: updatedUsers,
        currentUser: users.length === 0 ? newUser : get().currentUser,
        isLoading: false,
      });

      return newUser;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create user';
      console.error('[UserStore] Error creating user:', errorMessage);
      set({ error: errorMessage, isLoading: false });
      throw error;
    }
  },

  // Switch to a different user
  switchUser: async (userId: string) => {
    console.log('[UserStore] switchUser called:', userId);

    // A repeat of the switch already running is that same switch.
    if (switchInFlight?.userId === userId) return switchInFlight.promise;

    const previous = switchInFlight?.promise;
    const promise = (async () => {
      // A switch to somebody else queues: interleaving two of them would mix
      // one user's playlists with another's favourites.
      if (previous) await previous.catch(() => undefined);

      set({ isLoading: true, error: null });
      try {
        const user = await userRepository.getUserById(userId);
        if (!user) {
          throw new Error(`User with id ${userId} not found`);
        }

        await userRepository.updateLastActive(userId);

        set({ currentUser: user });

        // Favourites, reactions and header backgrounds, awaited: nothing of the
        // previous user may still be on screen once this resolves.
        await get().hydrateForUser(userId);

        await adoptCurrentUser(user, get().favoriteChannels);

        set({ isLoading: false });
        console.log('[UserStore] Switched to user:', user.username);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to switch user';
        console.error('[UserStore] Error switching user:', errorMessage);
        set({ error: errorMessage, isLoading: false });
        throw error;
      }
    })();

    switchInFlight = { userId, promise };
    try {
      await promise;
    } finally {
      // Only the newest switch may clear the slot; an older one has already
      // been superseded by the caller waiting behind it.
      if (switchInFlight?.promise === promise) switchInFlight = null;
    }
  },

  // Update user profile
  updateUser: async (userId: string, updates: UpdateUserInput) => {
    console.log('[UserStore] updateUser called:', userId);
    set({ isLoading: true, error: null });

    try {
      const updatedUser = await userRepository.updateUser(userId, updates);
      const { users, currentUser } = get();

      const updatedUsers = users.map(u => u.id === userId ? updatedUser : u);

      set({
        users: updatedUsers,
        currentUser: currentUser?.id === userId ? updatedUser : currentUser,
        isLoading: false,
      });

      console.log('[UserStore] User updated successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update user';
      console.error('[UserStore] Error updating user:', errorMessage);
      set({ error: errorMessage, isLoading: false });
      throw error;
    }
  },

  // Delete a user
  deleteUser: async (userId: string) => {
    console.log('[UserStore] deleteUser called:', userId);
    set({ isLoading: true, error: null });

    try {
      const { users, currentUser } = get();

      await userRepository.deleteUser(userId);

      const updatedUsers = users.filter(u => u.id !== userId);
      const currentUserDeleted = currentUser?.id === userId;
      const newCurrentUser = currentUserDeleted
        ? pickMostRecentlyActive(updatedUsers)
        : currentUser;

      if (currentUserDeleted && newCurrentUser) {
        await userRepository.updateLastActive(newCurrentUser.id);
      }

      set({
        users: updatedUsers,
        currentUser: newCurrentUser,
      });

      // Whoever takes over must not inherit the deleted user's favourites,
      // reactions or header backgrounds.
      if (currentUserDeleted) {
        if (newCurrentUser) {
          await get().hydrateForUser(newCurrentUser.id);
        } else {
          set({ favoriteChannels: [], contentReactions: {}, activeSessionId: null });
        }
      }

      // The deleted user's playlists are gone and the ones they shared may no
      // longer be visible, so the list and the pages cached from it have to be
      // rebuilt exactly as they are on a switch.
      await adoptCurrentUser(newCurrentUser, get().favoriteChannels);

      set({ isLoading: false });
      console.log('[UserStore] User deleted successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete user';
      console.error('[UserStore] Error deleting user:', errorMessage);
      set({ error: errorMessage, isLoading: false });
      throw error;
    }
  },


  // Update user settings
  updateSettings: async (userId: string, settings: Partial<UserSettings>) => {
    console.log('[UserStore] updateSettings called:', userId);

    try {
      await userRepository.updateUserSettings(userId, settings);
      await applyStoredUser(userId);

      console.log('[UserStore] Settings updated successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update settings';
      console.error('[UserStore] Error updating settings:', errorMessage);
      throw error;
    }
  },

  // Load favorite channels into store state
  loadFavoriteChannels: async (userId: string) => {
    // Shares the hydration guard: this load races `hydrateForUser`, and the
    // loser must not write another user's favourites over the winner's.
    const generation = ++hydrationGeneration;
    try {
      const favorites = await userRepository.getFavoriteChannels(userId);
      if (generation !== hydrationGeneration) return;
      set({ favoriteChannels: favorites });
    } catch (error) {
      console.error('[UserStore] Error loading favorite channels:', error);
    }
  },

  // Toggle favorite channel
  toggleFavorite: async (userId: string, channelId: string) => {
    console.log('[UserStore] toggleFavorite called:', { userId, channelId });

    // The list in the store belongs to the current user; once somebody else is
    // current, this toggle's result is no longer what is on screen. The write
    // still goes through — the user asked for it.
    const ownsList = () => get().currentUser?.id === userId;

    // Newest first, matching the repository's `addedAt DESC` ordering; the Set
    // keeps a re-add from duplicating an id.
    const withChannel = (ids: string[]) => [...new Set([channelId, ...ids])];
    const withoutChannel = (ids: string[]) => ids.filter((id) => id !== channelId);

    // Optimistic update; rolled back if the write fails. The current state is
    // the source of truth for the direction of the toggle — a round-trip to ask
    // the database first would let a double-tap read its own pending write.
    const isFav = get().favoriteChannels.includes(channelId);
    if (ownsList()) {
      set((state) => ({
        favoriteChannels: isFav
          ? withoutChannel(state.favoriteChannels)
          : withChannel(state.favoriteChannels),
      }));
    }

    try {
      if (isFav) {
        await userRepository.removeFavoriteChannel(userId, channelId);
      } else {
        await userRepository.addFavoriteChannel(userId, channelId);
      }

      console.log('[UserStore] Favorite toggled successfully');
    } catch (error) {
      // Revert this one id rather than restoring the whole list: another toggle
      // may have landed in between, and its result must survive.
      if (ownsList()) {
        set((state) => ({
          favoriteChannels: isFav
            ? withChannel(state.favoriteChannels)
            : withoutChannel(state.favoriteChannels),
        }));
      }
      const errorMessage = error instanceof Error ? error.message : 'Failed to toggle favorite';
      console.error('[UserStore] Error toggling favorite:', errorMessage);
      throw error;
    }
  },

  // Load content reactions into store state
  loadContentReactions: async (userId: string) => {
    try {
      const reactions = await userRepository.getContentReactions(userId);
      const contentReactions: Record<string, ContentReactionValue> = {};
      for (const { channelId, reaction } of reactions) {
        contentReactions[channelId] = reaction;
      }
      set({ contentReactions });
    } catch (error) {
      console.error('[UserStore] Error loading content reactions:', error);
    }
  },

  // Set (or clear, with null) the current user's reaction for a movie/series
  setReaction: async (userId: string, channelId: string, reaction: ContentReactionValue | null) => {
    console.log('[UserStore] setReaction called:', { userId, channelId, reaction });

    // Optimistic update; rolled back if the write fails
    const previousReactions = get().contentReactions;
    const contentReactions = { ...previousReactions };
    if (reaction === null) {
      delete contentReactions[channelId];
    } else {
      contentReactions[channelId] = reaction;
    }
    set({ contentReactions });

    try {
      await userRepository.setContentReaction(userId, channelId, reaction);
      console.log('[UserStore] Reaction set successfully');
    } catch (error) {
      set({ contentReactions: previousReactions });
      const errorMessage = error instanceof Error ? error.message : 'Failed to set reaction';
      console.error('[UserStore] Error setting reaction:', errorMessage);
      throw error;
    }
  },

  // Start a viewing session
  startViewingSession: async (params) => {
    try {
      const sessionId = await userRepository.startViewingSession(params);
      set({ activeSessionId: sessionId });
      return sessionId;
    } catch (error) {
      console.error('[UserStore] Error starting viewing session:', error);
      throw error;
    }
  },

  // Update session progress (periodic save)
  updateSessionProgress: async (sessionId, endPosition, durationWatched, totalDuration) => {
    try {
      await userRepository.updateSessionProgress(sessionId, endPosition, durationWatched, totalDuration);
    } catch (error) {
      console.error('[UserStore] Error updating session progress:', error);
    }
  },

  // End a viewing session
  endViewingSession: async (sessionId, endPosition, durationWatched, completed) => {
    try {
      await userRepository.endViewingSession(sessionId, endPosition, durationWatched, completed);
      set({ activeSessionId: null });
    } catch (error) {
      console.error('[UserStore] Error ending viewing session:', error);
    }
  },

  // Get continue watching items
  getContinueWatching: async (userId, playlistId, limit) => {
    return await userRepository.getContinueWatching(userId, playlistId, limit);
  },

  // Get recently watched items
  getRecentlyWatched: async (userId, playlistId, limit, options) => {
    return await userRepository.getRecentlyWatched(userId, playlistId, limit, options);
  },

  // Get the most recent watch row among specific channels (e.g. one series)
  getWatchStatsForChannels: async (userId, playlistId, channelIds) => {
    return await userRepository.getWatchStatsForChannels(userId, playlistId, channelIds);
  },

  // Get the seen set (watched movies and series) for the recommendation engine
  getWatchedContent: async (userId, playlistId) => {
    return await userRepository.getWatchedContent(userId, playlistId);
  },

  // Get full viewing history
  getViewingHistory: async (userId, limit) => {
    return await userRepository.getViewingHistory(userId, limit);
  },

  // Clear all viewing history for a user
  clearViewingHistory: async (userId) => {
    try {
      await userRepository.clearViewingHistory(userId);
      console.log('[UserStore] Viewing history cleared');
    } catch (error) {
      console.error('[UserStore] Error clearing viewing history:', error);
      throw error;
    }
  },

  // Close orphaned sessions (crash recovery)
  closeOrphanedSessions: async () => {
    try {
      // The session this app run started is still playing — it is not orphaned.
      await userRepository.closeOrphanedSessions(get().activeSessionId ?? undefined);
    } catch (error) {
      console.error('[UserStore] Error closing orphaned sessions:', error);
    }
  },

  // Get saved position for resume prompt
  getSavedPosition: async (userId, playlistId, channelId) => {
    return await userRepository.getSavedPosition(userId, playlistId, channelId);
  },

  // Resolve and persist the next episode for a completed series episode
  resolveAndStoreNextEpisode: async (userId: string, playlistId: string, channel: Channel) => {
    try {
      const seriesName = getSeriesNameForChannel(channel);
      const groupTitle = channel.group?.title;
      if (!groupTitle) return;

      const episodes = await RustChannelService.getSeriesEpisodes(playlistId, seriesName, groupTitle);
      if (episodes.length === 0) return;

      // Same ordering as the series detail screen, so "next episode" means the
      // same thing wherever it is shown.
      const sorted = sortEpisodes(episodes);

      const currentChannelId = getChannelId(channel);
      const currentIndex = sorted.findIndex((ep) => getChannelId(ep.channel) === currentChannelId);
      if (currentIndex === -1 || currentIndex >= sorted.length - 1) return;

      const nextEpisode = sorted[currentIndex + 1].channel;
      await userRepository.setNextEpisode(
        userId,
        playlistId,
        {
          channelId: currentChannelId,
          channelName: channel.name,
          groupTitle,
          contentType: 'series',
          tvgLogo: channel.tvg?.logo,
        },
        { channelId: getChannelId(nextEpisode), channelName: nextEpisode.name },
      );
      set((s) => ({ recentlyWatchedVersion: s.recentlyWatchedVersion + 1 }));
    } catch (error) {
      console.error('[UserStore] Error resolving next episode:', error);
    }
  },

  // Clear error
  clearError: () => {
    set({ error: null });
  },

  // Get favorite groups
  getFavoriteGroups: async (userId: string) => {
    return await userRepository.getFavoriteGroups(userId);
  },

  // Toggle favorite group
  toggleFavoriteGroup: async (userId: string, groupName: string) => {
    console.log('[UserStore] toggleFavoriteGroup called:', { userId, groupName });

    try {
      const isFav = await userRepository.isFavoriteGroup(userId, groupName);

      if (isFav) {
        await userRepository.removeFavoriteGroup(userId, groupName);
      } else {
        await userRepository.addFavoriteGroup(userId, groupName);
      }

      console.log('[UserStore] Favorite group toggled successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to toggle favorite group';
      console.error('[UserStore] Error toggling favorite group:', errorMessage);
      throw error;
    }
  },
}));

/**
 * Refresh one user's in-memory copy from what is stored.
 *
 * Used after a settings write, whoever made it: the database is the source of
 * truth for settings, so a write is followed by a read rather than by patching
 * the copy field by field.
 */
async function applyStoredUser(userId: string): Promise<void> {
  const stored = await userRepository.getUserById(userId);
  if (!stored) return;

  const { users, currentUser } = useUserStore.getState();
  useUserStore.setState({
    users: users.map((user) => (user.id === userId ? stored : user)),
    currentUser: currentUser?.id === userId ? stored : currentUser,
  });
}

// The playlist store must not import this one — that cycle is what
// `current-user-context` exists to break — so who is current is published to it
// on every change, and its settings writes are reflected back here.
useUserStore.subscribe((state, previous) => {
  if (state.currentUser?.id !== previous.currentUser?.id) {
    setCurrentUserId(state.currentUser?.id ?? null);
  }
});

subscribeToPersistedUserSettings(applyStoredUser);
