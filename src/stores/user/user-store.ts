import { userRepository } from '@/db/user-repository';
import { getChannelId } from '@/lib/channel-utils';
import { parseEpisodeInfo, stripEpisodeInfo } from '@/lib/series-utils';
import { RustChannelService } from '@/services/rust-channel-service';
import type {
  ContentReactionValue,
  ContentType,
  ContinueWatchingItem,
  CreateUserInput,
  GroupWatchStats,
  RecentlyWatchedItem,
  UpdateUserInput,
  User,
  UserSettings,
  ViewingSession,
  WatchedContent,
} from '@/types/user.types';
import type { Channel } from '@/types/playlist.types';
import { create } from 'zustand';

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
  createUser: (input: CreateUserInput) => Promise<User>;
  switchUser: (userId: string) => Promise<void>;
  updateUser: (userId: string, updates: UpdateUserInput) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;

  // Settings actions
  updateSettings: (userId: string, settings: Partial<UserSettings>) => Promise<void>;

  // Favorite channels actions
  loadFavoriteChannels: (userId: string) => Promise<void>;
  getFavoriteChannels: (userId: string) => Promise<string[]>;
  toggleFavorite: (userId: string, channelId: string) => Promise<void>;
  isFavorite: (userId: string, channelId: string) => Promise<boolean>;

  // Content reactions actions (like/dislike on movies/series)
  loadContentReactions: (userId: string) => Promise<void>;
  getReaction: (channelId: string) => ContentReactionValue | null;
  setReaction: (userId: string, channelId: string, reaction: ContentReactionValue | null) => Promise<void>;

  // Hidden channels actions
  getHiddenChannels: (userId: string) => Promise<string[]>;
  toggleHidden: (userId: string, channelId: string) => Promise<void>;
  isHidden: (userId: string, channelId: string) => Promise<boolean>;

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
  getRecentlyWatched: (userId: string, playlistId: string, limit?: number) => Promise<RecentlyWatchedItem[]>;
  getMostWatchedGroups: (userId: string, playlistId: string, limit?: number) => Promise<GroupWatchStats[]>;
  getWatchedContent: (userId: string, playlistId: string) => Promise<WatchedContent>;
  getViewingHistory: (userId: string, limit?: number) => Promise<ViewingSession[]>;
  clearViewingHistory: (userId: string) => Promise<void>;
  closeOrphanedSessions: () => Promise<void>;
  getSavedPosition: (userId: string, playlistId: string, channelId: string) => Promise<{ lastPosition: number; totalDuration?: number } | null>;
  resolveAndStoreNextEpisode: (userId: string, playlistId: string, channel: Channel) => Promise<void>;

  // Utility actions
  clearError: () => void;

  // Migration helper
  migrateFavoritesToNewFormat: (userId: string, channels: { name: string; url: string; tvg?: { id?: string } }[]) => Promise<void>;

  // Favorite groups actions
  getFavoriteGroups: (userId: string) => Promise<string[]>;
  toggleFavoriteGroup: (userId: string, groupName: string) => Promise<void>;
  isFavoriteGroup: (userId: string, groupName: string) => Promise<boolean>;
}

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

      // Set current user to first user if exists
      const firstUser = users[0] || null;

      set({
        users,
        currentUser: firstUser,
        isLoading: false,
      });

      // Hydrate favorite channels and content reactions for the initial user
      if (firstUser) {
        get().loadFavoriteChannels(firstUser.id);
        get().loadContentReactions(firstUser.id);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load users';
      console.error('[UserStore] Error loading users:', errorMessage);
      set({ error: errorMessage, isLoading: false });
      throw error;
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
    set({ isLoading: true, error: null });

    try {
      const user = await userRepository.getUserById(userId);
      if (!user) {
        throw new Error(`User with id ${userId} not found`);
      }

      await userRepository.updateLastActive(userId);

      set({
        currentUser: user,
        isLoading: false,
      });

      // Hydrate favorite channels and content reactions for the new user
      get().loadFavoriteChannels(userId);
      get().loadContentReactions(userId);

      // Reload header background selections for the new user
      try {
        const { useHeaderBackgroundStore } = await import('../header-background/header-background-store');
        await useHeaderBackgroundStore.getState().loadSelections(userId);
      } catch (error) {
        console.error('[UserStore] Failed to reload header backgrounds after user switch:', error);
      }

      // Reload playlist store to get the correct active playlist for this user
      try {
        const { usePlaylistStore } = await import('../playlist/playlist-store');
        await usePlaylistStore.getState().loadPlaylists();
      } catch (error) {
        console.error('[UserStore] Failed to reload playlists after user switch:', error);
      }

      console.log('[UserStore] Switched to user:', user.username);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to switch user';
      console.error('[UserStore] Error switching user:', errorMessage);
      set({ error: errorMessage, isLoading: false });
      throw error;
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
      const newCurrentUser = currentUser?.id === userId
        ? (updatedUsers[0] || null)
        : currentUser;

      if (newCurrentUser) {
        await userRepository.updateLastActive(newCurrentUser.id);
      }

      set({
        users: updatedUsers,
        currentUser: newCurrentUser,
        isLoading: false,
      });

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

      // Reload the user to get updated settings
      const updatedUser = await userRepository.getUserById(userId);
      if (!updatedUser) return;

      const { users, currentUser } = get();
      const updatedUsers = users.map(u => u.id === userId ? updatedUser : u);

      set({
        users: updatedUsers,
        currentUser: currentUser?.id === userId ? updatedUser : currentUser,
      });

      console.log('[UserStore] Settings updated successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update settings';
      console.error('[UserStore] Error updating settings:', errorMessage);
      throw error;
    }
  },

  // Load favorite channels into store state
  loadFavoriteChannels: async (userId: string) => {
    try {
      const favorites = await userRepository.getFavoriteChannels(userId);
      set({ favoriteChannels: favorites });
    } catch (error) {
      console.error('[UserStore] Error loading favorite channels:', error);
    }
  },

  // Get favorite channels
  getFavoriteChannels: async (userId: string) => {
    return await userRepository.getFavoriteChannels(userId);
  },

  // Toggle favorite channel
  toggleFavorite: async (userId: string, channelId: string) => {
    console.log('[UserStore] toggleFavorite called:', { userId, channelId });

    try {
      const isFav = await userRepository.isFavoriteChannel(userId, channelId);

      if (isFav) {
        await userRepository.removeFavoriteChannel(userId, channelId);
        set({ favoriteChannels: get().favoriteChannels.filter((id) => id !== channelId) });
      } else {
        await userRepository.addFavoriteChannel(userId, channelId);
        set({ favoriteChannels: [...get().favoriteChannels, channelId] });
      }

      console.log('[UserStore] Favorite toggled successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to toggle favorite';
      console.error('[UserStore] Error toggling favorite:', errorMessage);
      throw error;
    }
  },

  // Check if channel is favorite
  isFavorite: async (userId: string, channelId: string) => {
    return await userRepository.isFavoriteChannel(userId, channelId);
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

  // Get the current user's reaction for a movie/series (null = no reaction)
  getReaction: (channelId: string) => {
    return get().contentReactions[channelId] ?? null;
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

  // Get hidden channels
  getHiddenChannels: async (userId: string) => {
    return await userRepository.getHiddenChannels(userId);
  },

  // Toggle hidden channel
  toggleHidden: async (userId: string, channelId: string) => {
    console.log('[UserStore] toggleHidden called:', { userId, channelId });

    try {
      const isHidden = await userRepository.isChannelHidden(userId, channelId);

      if (isHidden) {
        await userRepository.unhideChannel(userId, channelId);
      } else {
        await userRepository.hideChannel(userId, channelId);
      }

      console.log('[UserStore] Hidden toggled successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to toggle hidden';
      console.error('[UserStore] Error toggling hidden:', errorMessage);
      throw error;
    }
  },

  // Check if channel is hidden
  isHidden: async (userId: string, channelId: string) => {
    return await userRepository.isChannelHidden(userId, channelId);
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
  getRecentlyWatched: async (userId, playlistId, limit) => {
    return await userRepository.getRecentlyWatched(userId, playlistId, limit);
  },

  // Get most watched groups
  getMostWatchedGroups: async (userId, playlistId, limit) => {
    return await userRepository.getMostWatchedGroups(userId, playlistId, limit);
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
      await userRepository.closeOrphanedSessions();
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
      const seriesName = stripEpisodeInfo(channel.name);
      const groupTitle = channel.group?.title;
      if (!groupTitle) return;

      const episodes = await RustChannelService.getSeriesEpisodes(playlistId, seriesName, groupTitle);
      if (episodes.length === 0) return;

      // Sort by season/episode
      const sorted = [...episodes].sort((a, b) => {
        const pa = parseEpisodeInfo(a);
        const pb = parseEpisodeInfo(b);
        return pa.season !== pb.season ? pa.season - pb.season : pa.episode - pb.episode;
      });

      const currentChannelId = getChannelId(channel);
      const currentIndex = sorted.findIndex((ep) => getChannelId(ep) === currentChannelId);
      if (currentIndex === -1 || currentIndex >= sorted.length - 1) return;

      const nextEpisode = sorted[currentIndex + 1];
      await userRepository.setNextEpisode(
        userId,
        playlistId,
        currentChannelId,
        getChannelId(nextEpisode),
        nextEpisode.name,
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

  // Migrate favorites to new format
  migrateFavoritesToNewFormat: async (userId: string, channels: { name: string; url: string; tvg?: { id?: string } }[]) => {
    await userRepository.migrateFavoritesToNewFormat(userId, channels);
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

  // Check if group is favorite
  isFavoriteGroup: async (userId: string, groupName: string) => {
    return await userRepository.isFavoriteGroup(userId, groupName);
  },
}));
