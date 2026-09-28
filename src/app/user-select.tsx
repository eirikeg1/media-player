import { AddUserCard, UserProfileCard } from '@/features/user/user-profile-card';
import { AnimatedModal } from '@/components/ui/containers/modal/animated-modal';
import { ConfirmDialog } from '@/components/ui/containers/modal/confirm-dialog';
import { ThemedText } from '@/components/ui/display/themed-text';
import { getInitials } from '@/features/user/get-initials';
import { firstVisibleTabHref } from '@/features/user/visible-tabs';
import { useBackClose } from '@/hooks/use-back-close';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useHaptics } from '@/hooks/use-haptics';
import { useThemeColor } from '@/hooks/use-theme-color';
import { GlassColors, TINT } from '@/lib/theme';
import { useUserStore } from '@/stores/user/user-store';
import type { UpdateUserInput, User } from '@/types/user.types';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const PROFILE_ICON = '👤';

// Types
interface UserFormProps {
  username: string;
  isCreating: boolean;
  onUsernameChange: (text: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
}

interface UserGridItemProps {
  user: User;
  isCurrentUser: boolean;
  onSelect: (userId: string) => void;
}

interface UserSelectionScreenProps {
  users: User[];
  currentUserId?: string;
  onSelectUser: (userId: string) => void;
  onAddUser: () => void;
  onEditUser: () => void;
  onBack: () => void;
}

/**
 * The colours this screen's surfaces need. Grouped in one hook so every panel,
 * field and button on the screen reads them the same way.
 */
function useSelectPalette() {
  const colorScheme = useColorScheme();
  const glass = colorScheme === 'dark' ? GlassColors.dark : GlassColors.light;

  return {
    background: useThemeColor({}, 'background'),
    card: useThemeColor({}, 'card'),
    border: useThemeColor({}, 'border'),
    muted: useThemeColor({}, 'muted'),
    destructive: useThemeColor({}, 'destructive'),
    surface: glass.surface,
    surfaceBorder: glass.border,
  };
}

/**
 * First-time user creation screen
 */
function FirstUserScreen({ username, isCreating, onUsernameChange, onSubmit }: UserFormProps) {
  const palette = useSelectPalette();

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]} edges={['top']}>
      <KeyboardAvoidingView style={styles.fill} behavior="padding">
        <ScrollView contentContainerStyle={styles.centeredScroll} keyboardShouldPersistTaps="always">
          <View style={styles.fill} />
          <View style={styles.gutter}>
            <View style={styles.welcomeBlock}>
              <ThemedText style={styles.welcomeTitle}>Welcome!</ThemedText>
              <ThemedText style={[styles.welcomeSubtitle, { color: palette.muted }]}>
                Let&apos;s create your profile to get started
              </ThemedText>
            </View>

            <View style={styles.avatarRow}>
              <View style={[styles.largeAvatar, { backgroundColor: TINT }]}>
                <ThemedText style={styles.largeAvatarGlyph}>{PROFILE_ICON}</ThemedText>
              </View>
            </View>

            <View style={styles.formColumn}>
              <ThemedText style={styles.fieldLabelLarge}>Your Name</ThemedText>

              <TextInput
                testID="first-user-username-input"
                style={[
                  styles.textInputLarge,
                  { backgroundColor: palette.card, borderColor: palette.border },
                ]}
                placeholder="Enter your name"
                placeholderTextColor={palette.muted}
                value={username}
                onChangeText={onUsernameChange}
                autoFocus
                editable={!isCreating}
                returnKeyType="done"
                onSubmitEditing={onSubmit}
              />

              <Pressable
                testID="first-user-submit-button"
                onPress={onSubmit}
                disabled={isCreating || !username.trim()}
                style={({ pressed }) => [
                  styles.primaryButtonLarge,
                  { backgroundColor: TINT },
                  (isCreating || !username.trim()) && styles.disabled,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Create profile and continue"
                accessibilityState={{ disabled: isCreating || !username.trim() }}
              >
                <ThemedText style={styles.onAccentLabelLarge}>
                  {isCreating ? 'Creating Profile...' : 'Continue'}
                </ThemedText>
              </Pressable>
            </View>

            <View style={styles.footnote}>
              <ThemedText style={[styles.footnoteText, { color: palette.muted }]}>
                You can add more profiles later in settings
              </ThemedText>
            </View>
          </View>
          <View style={styles.fill} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * User profile grid item with current user badge
 */
function UserGridItem({ user, isCurrentUser, onSelect }: UserGridItemProps) {
  return (
    <View style={styles.gridCell}>
      <UserProfileCard user={user} isCurrentUser={isCurrentUser} onPress={() => onSelect(user.id)} />
    </View>
  );
}

/**
 * Netflix-style user selection grid
 */
function UserSelectionScreen({
  users,
  currentUserId,
  onSelectUser,
  onAddUser,
  onEditUser,
  onBack,
}: UserSelectionScreenProps) {
  const palette = useSelectPalette();

  return (
    <ScrollView contentContainerStyle={styles.gridScroll}>
      <View style={styles.gutter}>
        <View style={styles.gridHeading}>
          <ThemedText style={styles.welcomeTitle}>Who&apos;s watching?</ThemedText>
        </View>

        <View style={styles.grid}>
          {users.map((user) => (
            <UserGridItem
              key={user.id}
              user={user}
              isCurrentUser={user.id === currentUserId}
              onSelect={onSelectUser}
            />
          ))}

          <View style={styles.gridCell}>
            <AddUserCard onPress={onAddUser} />
          </View>
        </View>

        <View style={styles.gridActions}>
          <Pressable
            onPress={onBack}
            style={({ pressed }) => [
              styles.pillButton,
              { borderWidth: 1, borderColor: palette.border },
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Back to settings"
          >
            <ThemedText style={styles.pillButtonLabel}>Back to Settings</ThemedText>
          </Pressable>
          <Pressable
            onPress={onEditUser}
            style={({ pressed }) => [
              styles.pillButton,
              { backgroundColor: TINT },
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Edit profiles"
          >
            <ThemedText style={[styles.pillButtonLabel, styles.onAccentLabel]}>Edit</ThemedText>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

/**
 * Name field plus avatar, shared by the create and edit profile dialogs.
 */
function ProfileFormFields({
  heading,
  value,
  onChangeText,
  editable,
  onSubmitEditing,
}: {
  heading: string;
  value: string;
  onChangeText: (text: string) => void;
  editable: boolean;
  onSubmitEditing: () => void;
}) {
  const palette = useSelectPalette();

  return (
    <>
      <ThemedText style={styles.dialogTitle}>{heading}</ThemedText>

      <View style={styles.avatarRow}>
        <View style={[styles.mediumAvatar, { backgroundColor: TINT }]}>
          <ThemedText style={styles.mediumAvatarGlyph}>{PROFILE_ICON}</ThemedText>
        </View>
      </View>

      <ThemedText style={styles.fieldLabel}>Name</ThemedText>

      <TextInput
        style={[styles.textInput, { backgroundColor: palette.card, borderColor: palette.border }]}
        placeholder="Enter name"
        placeholderTextColor={palette.muted}
        value={value}
        onChangeText={onChangeText}
        autoFocus
        editable={editable}
        returnKeyType="done"
        onSubmitEditing={onSubmitEditing}
      />
    </>
  );
}

/** Cancel / confirm pair used by the create and edit profile dialogs. */
function DialogActions({
  onCancel,
  cancelLabel,
  onConfirm,
  confirmLabel,
  confirmDisabled,
  cancelDisabled,
  confirmAccessibilityLabel,
}: {
  onCancel: () => void;
  cancelLabel: string;
  onConfirm: () => void;
  confirmLabel: string;
  confirmDisabled: boolean;
  cancelDisabled: boolean;
  confirmAccessibilityLabel: string;
}) {
  const palette = useSelectPalette();

  return (
    <View style={styles.dialogActions}>
      <Pressable
        onPress={onCancel}
        disabled={cancelDisabled}
        style={({ pressed }) => [
          styles.dialogButton,
          { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.surfaceBorder },
          cancelDisabled && styles.disabled,
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={cancelLabel}
        accessibilityState={{ disabled: cancelDisabled }}
      >
        <ThemedText style={styles.dialogButtonLabel}>Cancel</ThemedText>
      </Pressable>

      <Pressable
        onPress={onConfirm}
        disabled={confirmDisabled}
        style={({ pressed }) => [
          styles.dialogButton,
          { backgroundColor: TINT },
          confirmDisabled && styles.disabled,
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={confirmAccessibilityLabel}
        accessibilityState={{ disabled: confirmDisabled }}
      >
        <ThemedText style={[styles.dialogButtonLabel, styles.onAccentLabel]}>
          {confirmLabel}
        </ThemedText>
      </Pressable>
    </View>
  );
}

/**
 * Modal for creating a new user profile with smooth keyboard animation
 */
function CreateUserModal({
  username,
  isCreating,
  onUsernameChange,
  onSubmit,
  onCancel,
}: UserFormProps) {
  return (
    <AnimatedModal visible={true} onClose={isCreating ? undefined : onCancel}>
      <ProfileFormFields
        heading="Create New Profile"
        value={username}
        onChangeText={onUsernameChange}
        editable={!isCreating}
        onSubmitEditing={onSubmit}
      />
      <DialogActions
        onCancel={() => onCancel?.()}
        cancelLabel="Cancel profile creation"
        cancelDisabled={isCreating}
        onConfirm={onSubmit}
        confirmLabel={isCreating ? 'Creating...' : 'Create'}
        confirmDisabled={isCreating || !username.trim()}
        confirmAccessibilityLabel="Create new profile"
      />
    </AnimatedModal>
  );
}

/**
 * Modal for editing user profiles with username change and delete functionality
 */
function EditUserModal({
  users,
  onUpdateUser,
  onDeleteUser,
  onCancel
}: {
  users: User[];
  onUpdateUser: (userId: string, updates: UpdateUserInput) => Promise<void>;
  onDeleteUser: (userId: string) => Promise<void>;
  onCancel: () => void;
}) {
  const palette = useSelectPalette();
  const haptics = useHaptics();
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [newUsername, setNewUsername] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [pendingDeleteUser, setPendingDeleteUser] = useState<User | null>(null);

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setNewUsername(user.username);
  };

  const handleUpdateUser = async () => {
    if (!editingUser || !newUsername.trim()) return;

    setIsUpdating(true);
    try {
      await onUpdateUser(editingUser.id, { username: newUsername.trim() });
      setEditingUser(null);
      setNewUsername('');
    } catch (error) {
      console.error('Failed to update user:', error);
      Alert.alert('Error', 'Failed to update user. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteUser = (user: User) => {
    haptics.warning();
    setPendingDeleteUser(user);
  };

  const cancelEditing = useCallback(() => setEditingUser(null), []);

  // The panel is an absolute overlay, not a route: without this, back would pop
  // the whole user-select screen from under it. The edit form covers itself (a
  // Modal gets back directly), as does the delete confirmation.
  useBackClose(!editingUser, onCancel);

  if (editingUser) {
    return (
      <AnimatedModal visible={true} onClose={isUpdating ? undefined : cancelEditing}>
        <ProfileFormFields
          heading="Edit Profile"
          value={newUsername}
          onChangeText={setNewUsername}
          editable={!isUpdating}
          onSubmitEditing={handleUpdateUser}
        />
        <DialogActions
          onCancel={cancelEditing}
          cancelLabel="Cancel editing"
          cancelDisabled={isUpdating}
          onConfirm={handleUpdateUser}
          confirmLabel={isUpdating ? 'Saving...' : 'Save'}
          confirmDisabled={isUpdating || !newUsername.trim()}
          confirmAccessibilityLabel="Save changes"
        />
      </AnimatedModal>
    );
  }

  return (
    <View style={styles.editOverlay}>
      <View style={[styles.editPanel, { backgroundColor: palette.card }]}>
        <ThemedText style={styles.dialogTitle}>Edit Profiles</ThemedText>

        <ScrollView style={styles.editList} showsVerticalScrollIndicator={false}>
          {users.map((user) => (
            <View key={user.id} style={[styles.editRow, { borderBottomColor: palette.border }]}>
              <View style={styles.editRowUser}>
                <View style={[styles.smallAvatar, { backgroundColor: TINT }]}>
                  <ThemedText style={styles.smallAvatarLabel}>
                    {getInitials(user.username)}
                  </ThemedText>
                </View>
                <ThemedText style={styles.editRowName} numberOfLines={1}>
                  {user.username}
                </ThemedText>
              </View>
              <View style={styles.editRowActions}>
                <Pressable
                  onPress={() => handleEditUser(user)}
                  style={({ pressed }) => [
                    styles.chipButton,
                    { backgroundColor: TINT },
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${user.username}`}
                >
                  <ThemedText style={[styles.chipButtonLabel, styles.onAccentLabel]}>
                    Edit
                  </ThemedText>
                </Pressable>
                {users.length > 1 && (
                  <Pressable
                    onPress={() => handleDeleteUser(user)}
                    style={({ pressed }) => [
                      styles.chipButton,
                      { backgroundColor: palette.destructive },
                      pressed && styles.pressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${user.username}`}
                  >
                    <ThemedText style={[styles.chipButtonLabel, styles.onAccentLabel]}>
                      Delete
                    </ThemedText>
                  </Pressable>
                )}
              </View>
            </View>
          ))}
        </ScrollView>

        <Pressable
          onPress={onCancel}
          style={({ pressed }) => [
            styles.dialogButton,
            { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.surfaceBorder },
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Close edit profiles"
        >
          <ThemedText style={styles.dialogButtonLabel}>Done</ThemedText>
        </Pressable>
      </View>

      <ConfirmDialog
        visible={pendingDeleteUser !== null}
        title="Delete Profile"
        message={`Are you sure you want to delete "${pendingDeleteUser?.username}"? This action cannot be undone.`}
        actions={[
          {
            title: 'Cancel',
            onPress: () => setPendingDeleteUser(null),
          },
          {
            title: 'Delete',
            variant: 'danger',
            onPress: async () => {
              if (pendingDeleteUser) {
                try {
                  await onDeleteUser(pendingDeleteUser.id);
                } catch (error) {
                  console.error('Failed to delete user:', error);
                  Alert.alert('Error', 'Failed to delete user. Please try again.');
                }
              }
              setPendingDeleteUser(null);
            },
          },
        ]}
      />
    </View>
  );
}

/**
 * Main user selection screen component
 */
export default function UserSelectScreen() {
  // Store state
  const users = useUserStore((state) => state.users);
  const currentUserId = useUserStore((state) => state.currentUser?.id);
  const switchUser = useUserStore((state) => state.switchUser);
  const createUser = useUserStore((state) => state.createUser);
  const updateUser = useUserStore((state) => state.updateUser);
  const deleteUser = useUserStore((state) => state.deleteUser);

  const backgroundColor = useThemeColor({}, 'background');

  // Local state
  const [newUsername, setNewUsername] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const isFirstUser = users.length === 0;

  // Event handlers
  const handleSelectUser = useCallback(
    async (userId: string) => {
      if (userId === currentUserId) {
        router.back();
        return;
      }

      try {
        await switchUser(userId);
        router.back();
      } catch (error) {
        console.error('[UserSelect] Failed to switch user:', error);
        Alert.alert('Error', 'Failed to switch user. Please try again.');
      }
    },
    [currentUserId, switchUser]
  );

  const handleCreateUser = useCallback(async () => {
    const trimmedUsername = newUsername.trim();

    if (!trimmedUsername) {
      Alert.alert('Error', 'Please enter a username');
      return;
    }

    setIsCreating(true);

    try {
      const newUser = await createUser({ username: trimmedUsername });

      // Reset form state
      setNewUsername('');
      setShowCreateForm(false);

      // For first user, switch to them and navigate to tabs — to the first tab
      // they can actually see, since Home is hideable.
      if (isFirstUser) {
        await switchUser(newUser.id);
        router.replace(firstVisibleTabHref(newUser.settings));
      }
    } catch (error) {
      console.error('[UserSelect] Failed to create user:', error);
      Alert.alert('Error', 'Failed to create user. Please try again.');
    } finally {
      setIsCreating(false);
    }
  }, [newUsername, isFirstUser, createUser, switchUser]);

  const handleAddUserPress = useCallback(() => {
    setShowCreateForm(true);
    setNewUsername('');
  }, []);

  const handleCancelCreate = useCallback(() => {
    setShowCreateForm(false);
    setNewUsername('');
  }, []);

  const handleBack = useCallback(() => {
    router.back();
  }, []);

  const handleEditUser = useCallback(() => {
    setShowEditModal(true);
  }, []);

  const handleUpdateUser = useCallback(async (userId: string, updates: UpdateUserInput) => {
    await updateUser(userId, updates);
  }, [updateUser]);

  const handleDeleteUser = useCallback(async (userId: string) => {
    // If deleting current user, switch to another user first
    if (userId === currentUserId && users.length > 1) {
      const otherUser = users.find(u => u.id !== userId);
      if (otherUser) {
        await switchUser(otherUser.id);
      }
    }
    await deleteUser(userId);
  }, [deleteUser, currentUserId, users, switchUser]);

  const handleCancelEdit = useCallback(() => {
    setShowEditModal(false);
  }, []);

  // Render first-time user creation screen
  if (isFirstUser) {
    return (
      <FirstUserScreen
        username={newUsername}
        isCreating={isCreating}
        onUsernameChange={setNewUsername}
        onSubmit={handleCreateUser}
      />
    );
  }

  // Render user selection screen with optional create modal
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor }]} edges={['top']}>
      <UserSelectionScreen
        users={users}
        currentUserId={currentUserId}
        onSelectUser={handleSelectUser}
        onAddUser={handleAddUserPress}
        onEditUser={handleEditUser}
        onBack={handleBack}
      />

      {showCreateForm && (
        <CreateUserModal
          username={newUsername}
          isCreating={isCreating}
          onUsernameChange={setNewUsername}
          onSubmit={handleCreateUser}
          onCancel={handleCancelCreate}
        />
      )}

      {showEditModal && (
        <EditUserModal
          users={users}
          onUpdateUser={handleUpdateUser}
          onDeleteUser={handleDeleteUser}
          onCancel={handleCancelEdit}
        />
      )}
    </SafeAreaView>
  );
}

const ON_ACCENT = '#FFFFFF';

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  fill: {
    flex: 1,
  },
  gutter: {
    paddingHorizontal: 32,
  },
  centeredScroll: {
    flexGrow: 1,
  },
  gridScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 32,
  },

  // First-run screen
  welcomeBlock: {
    marginBottom: 48,
    gap: 16,
  },
  welcomeTitle: {
    fontSize: 48,
    lineHeight: 56,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  welcomeSubtitle: {
    fontSize: 18,
    textAlign: 'center',
  },
  formColumn: {
    width: '100%',
    maxWidth: 448,
    alignSelf: 'center',
  },
  footnote: {
    marginTop: 48,
  },
  footnoteText: {
    fontSize: 14,
    textAlign: 'center',
  },

  // Avatars
  avatarRow: {
    alignItems: 'center',
    marginBottom: 24,
  },
  largeAvatar: {
    width: 128,
    height: 128,
    borderRadius: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  largeAvatarGlyph: {
    fontSize: 60,
    lineHeight: 72,
  },
  mediumAvatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediumAvatarGlyph: {
    fontSize: 48,
    lineHeight: 58,
  },
  smallAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallAvatarLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: ON_ACCENT,
  },

  // Fields
  fieldLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  fieldLabelLarge: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  textInput: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 16,
    marginBottom: 24,
  },
  textInputLarge: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 18,
    marginBottom: 24,
  },

  // Buttons
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.5,
  },
  onAccentLabel: {
    color: ON_ACCENT,
  },
  onAccentLabelLarge: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    color: ON_ACCENT,
  },
  primaryButtonLarge: {
    paddingVertical: 16,
    borderRadius: 12,
    minHeight: 44,
    justifyContent: 'center',
  },
  pillButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  pillButtonLabel: {
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  dialogActions: {
    flexDirection: 'row',
    gap: 12,
  },
  dialogButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    minHeight: 44,
    justifyContent: 'center',
  },
  dialogButtonLabel: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  chipButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    minHeight: 36,
    justifyContent: 'center',
  },
  chipButtonLabel: {
    fontSize: 14,
    fontWeight: '500',
  },

  // Selection grid
  gridHeading: {
    marginBottom: 64,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 32,
    marginBottom: 32,
  },
  gridCell: {
    width: 128,
  },
  gridActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 32,
  },

  // Dialogs
  dialogTitle: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 24,
  },
  editOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  editPanel: {
    width: '100%',
    maxWidth: 448,
    maxHeight: '80%',
    borderRadius: 16,
    padding: 32,
  },
  editList: {
    marginBottom: 24,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  editRowUser: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  editRowName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  },
  editRowActions: {
    flexDirection: 'row',
    gap: 8,
  },
});
