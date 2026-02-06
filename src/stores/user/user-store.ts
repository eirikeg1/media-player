import { userRepository } from '@/db/user-repository';
import type { CreateUserInput, UpdateUserInput, User, UserSettings } from '@/types/user.types';
import { create } from 'zustand';

interface UserState {
  // State
  users: User[];
  currentUser: User | null;
  isLoading: boolean;
  error: string | null;

  // User management actions
  loadUsers: () => Promise<void>;
  createUser: (input: CreateUserInput) => Promise<User>;
  switchUser: (userId: string) => Promise<void>;
  updateUser: (userId: string, updates: UpdateUserInput) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;

  // Settings actions
  updateSettings: (userId: string, settings: Partial<UserSettings>) => Promise<void>;

  // Favorite channels actions
  getFavoriteChannels: (userId: string) => Promise<string[]>;
  toggleFavorite: (userId: string, channelId: string) => Promise<void>;
  isFavorite: (userId: string, channelId: string) => Promise<boolean>;

  // Hidden channels actions
  getHiddenChannels: (userId: string) => Promise<string[]>;
  toggleHidden: (userId: string, channelId: string) => Promise<void>;
  isHidden: (userId: string, channelId: string) => Promise<boolean>;

  // Watch history actions
  addToWatchHistory: (userId: string, channelId: string, duration: number) => Promise<void>;
  getWatchHistory: (userId: string, limit?: number) => Promise<any[]>;

  // Playback position actions
  savePlaybackPosition: (userId: string, channelId: string, position: number, totalDuration: number) => Promise<void>;
  getPlaybackPosition: (userId: string, channelId: string) => Promise<any>;

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
      } else {
        await userRepository.addFavoriteChannel(userId, channelId);
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

  // Add to watch history
  addToWatchHistory: async (userId: string, channelId: string, duration: number) => {
    console.log('[UserStore] addToWatchHistory called:', { userId, channelId, duration });

    try {
      await userRepository.addWatchHistory(userId, channelId, duration);
      console.log('[UserStore] Added to watch history');
    } catch (error) {
      console.error('[UserStore] Error adding to watch history:', error);
      throw error;
    }
  },

  // Get watch history
  getWatchHistory: async (userId: string, limit?: number) => {
    return await userRepository.getWatchHistory(userId, limit);
  },

  // Save playback position
  savePlaybackPosition: async (userId: string, channelId: string, position: number, totalDuration: number) => {
    console.log('[UserStore] savePlaybackPosition called:', { userId, channelId, position });

    try {
      await userRepository.savePlaybackPosition(userId, channelId, position, totalDuration);
      console.log('[UserStore] Playback position saved');
    } catch (error) {
      console.error('[UserStore] Error saving playback position:', error);
      throw error;
    }
  },

  // Get playback position
  getPlaybackPosition: async (userId: string, channelId: string) => {
    return await userRepository.getPlaybackPosition(userId, channelId);
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
