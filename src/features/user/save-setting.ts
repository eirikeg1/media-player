import { Alert } from 'react-native';

import { useUserStore } from '@/stores/user/user-store';
import type { UserSettings } from '@/types/user.types';

/**
 * Persist a settings patch for the current user.
 *
 * Settings are toggled from switches and pickers whose handlers return void, so
 * every call site used to fire `updateSettings` unawaited — leaving the control
 * showing a value that was never written, and the rejection unhandled. This
 * awaits the write and tells the user when it failed.
 *
 * Never rejects: the failure is already reported to the user.
 *
 * @param patch settings fields to write
 * @param label what the user was changing, e.g. "Private Mode" — shown as
 *   "Couldn't save Private Mode"
 */
export async function saveSetting(
  patch: Partial<UserSettings>,
  label: string
): Promise<void> {
  const { currentUser, updateSettings } = useUserStore.getState();
  if (!currentUser) return;

  try {
    await updateSettings(currentUser.id, patch);
  } catch (error) {
    console.error(`[saveSetting] Failed to save ${label}:`, error);
    Alert.alert(
      `Couldn't save ${label}`,
      error instanceof Error ? error.message : 'Please try again.'
    );
  }
}
