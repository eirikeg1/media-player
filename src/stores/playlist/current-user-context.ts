import { userRepository } from '@/db/user-repository';

/**
 * The playlist store's view of the current user.
 *
 * The playlist store needs who the current user is and what they chose; the user
 * store needs the playlist store, because switching user reloads the playlists
 * visible to them. Importing each other is a cycle, so this leaf module holds
 * the narrow contract between the two: the user store publishes the current
 * user's id, the playlist store reads their settings straight from the
 * repository, and a settings write made through here is announced back so the
 * user store's in-memory copy of the user stays in step.
 *
 * Neither store imports the other's module; both import this one.
 */

/** The current user's identity and the settings the playlist store reads. */
export interface CurrentUserContext {
  userId: string;
  /** Whether playlists other users created are visible to this one. */
  playlistSharingEnabled: boolean;
  /** The playlist this user last selected, if one is stored. */
  activePlaylistId: string | undefined;
}

/** A listener notified after this module writes a user's settings. */
type SettingsListener = (userId: string) => void | Promise<void>;

let currentUserId: string | null = null;
const settingsListeners = new Set<SettingsListener>();

/**
 * Publish who the current user is.
 *
 * Called by the user store, which owns that decision; nothing else may set it.
 */
export function setCurrentUserId(userId: string | null): void {
  currentUserId = userId;
}

/** The current user's id, or null when no user has been adopted yet. */
export function getCurrentUserId(): string | null {
  return currentUserId;
}

/**
 * The current user's id together with the settings the playlist store acts on,
 * or null when there is no current user.
 *
 * The settings come from the repository rather than the user store's copy: the
 * repository is what every settings write goes through, so it is never staler
 * than the copy, and reading it keeps this module a leaf.
 */
export async function getCurrentUserContext(): Promise<CurrentUserContext | null> {
  const userId = currentUserId;
  if (!userId) return null;

  const settings = await userRepository.getUserSettings(userId);
  return {
    userId,
    playlistSharingEnabled: settings?.playlistSharingEnabled ?? true,
    activePlaylistId: settings?.activePlaylistId,
  };
}

/**
 * Store a user's active playlist and tell the listeners it changed.
 *
 * The notification is awaited: the caller selects a playlist and then expects
 * every reader of the user's settings to agree with the selection.
 */
export async function persistActivePlaylist(
  userId: string,
  playlistId: string | null,
): Promise<void> {
  await userRepository.updateUserSettings(userId, {
    activePlaylistId: playlistId || undefined,
  });
  await Promise.all([...settingsListeners].map((listener) => listener(userId)));
}

/**
 * Be told when this module writes a user's settings, so an in-memory copy of
 * that user can be refreshed. Returns the unsubscribe function.
 */
export function subscribeToPersistedUserSettings(listener: SettingsListener): () => void {
  settingsListeners.add(listener);
  return () => {
    settingsListeners.delete(listener);
  };
}
