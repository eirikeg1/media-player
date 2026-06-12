import { AddUserCard, UserProfileCard } from '@/features/user/user-profile-card';
import { AnimatedModal } from '@/components/ui/containers/modal/animated-modal';
import { ConfirmDialog } from '@/components/ui/containers/modal/confirm-dialog';
import { useUserStore } from '@/stores/user/user-store';
import type { UpdateUserInput, User } from '@/types/user.types';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Constants
const PLACEHOLDER_COLOR = '#9CA3AF';
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
 * First-time user creation screen
 */
function FirstUserScreen({ username, isCreating, onUsernameChange, onSubmit }: UserFormProps) {
  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-gray-950" edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="always"
        >
          <View className="flex-1" />
          <View className="px-8">
            <View className="mb-12">
              <Text className="text-5xl font-bold text-center mb-4 text-gray-900 dark:text-white">
                Welcome!
              </Text>
              <Text className="text-lg text-center text-gray-600 dark:text-gray-400">
                Let&apos;s create your profile to get started
              </Text>
            </View>

            <View className="items-center mb-8">
              <View className="w-32 h-32 rounded-full bg-blue-600 items-center justify-center">
                <Text className="text-6xl">{PROFILE_ICON}</Text>
              </View>
            </View>

            <View className="max-w-md w-full mx-auto">
              <Text className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">
                Your Name
              </Text>

              <TextInput
                testID="first-user-username-input"
                className="bg-gray-100 dark:bg-gray-800 px-5 py-4 rounded-xl text-lg text-gray-900 dark:text-white mb-6 border border-gray-200 dark:border-gray-700"
                placeholder="Enter your name"
                placeholderTextColor={PLACEHOLDER_COLOR}
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
                className="bg-blue-600 py-4 rounded-xl disabled:opacity-50"
                accessibilityRole="button"
                accessibilityLabel="Create profile and continue"
              >
                <Text className="text-center text-lg font-semibold text-white">
                  {isCreating ? 'Creating Profile...' : 'Continue'}
                </Text>
              </Pressable>
            </View>

            <View className="mt-12">
              <Text className="text-center text-sm text-gray-500 dark:text-gray-400">
                You can add more profiles later in settings
              </Text>
            </View>
          </View>
          <View className="flex-1" />
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
    <View className="w-32">
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
  return (
    <ScrollView contentContainerClassName="flex-grow justify-center py-8">
      <View className="px-8">
        <View className="mb-16">
          <Text className="text-5xl font-bold text-center text-gray-900 dark:text-white">
            Who&apos;s watching?
          </Text>
        </View>

        <View className="flex-row flex-wrap justify-center gap-8 mb-8">
          {users.map((user) => (
            <UserGridItem
              key={user.id}
              user={user}
              isCurrentUser={user.id === currentUserId}
              onSelect={onSelectUser}
            />
          ))}

          <View className="w-32">
            <AddUserCard onPress={onAddUser} />
          </View>
        </View>

        <View className="items-center mt-8">
          <View className="flex-row gap-4">
            <Pressable
              onPress={onBack}
              className="px-6 py-3 border border-gray-300 dark:border-gray-700 rounded-lg"
              accessibilityRole="button"
              accessibilityLabel="Back to settings"
            >
              <Text className="text-base font-medium text-gray-700 dark:text-gray-300">
                Back to Settings
              </Text>
            </Pressable>
            <Pressable
              onPress={onEditUser}
              className="px-6 py-3 bg-blue-600 rounded-lg"
              accessibilityRole="button"
              accessibilityLabel="Edit profiles"
            >
              <Text className="text-base font-medium text-white">
                Edit
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

/**
 * Modal for creating a new user profile with smooth keyboard animation
 */
function CreateUserModal({ username, isCreating, onUsernameChange, onSubmit, onCancel }: UserFormProps) {
  return (
    <AnimatedModal visible={true}>
      <Text className="text-2xl font-bold mb-6 text-gray-900 dark:text-white text-center">
        Create New Profile
      </Text>

      <View className="items-center mb-6">
        <View className="w-24 h-24 rounded-full bg-blue-600 items-center justify-center">
          <Text className="text-5xl">{PROFILE_ICON}</Text>
        </View>
      </View>

      <Text className="text-base font-semibold mb-3 text-gray-900 dark:text-white">Name</Text>

      <TextInput
        className="bg-gray-100 dark:bg-gray-800 px-4 py-3 rounded-xl text-base text-gray-900 dark:text-white mb-6 border border-gray-200 dark:border-gray-700"
        placeholder="Enter name"
        placeholderTextColor={PLACEHOLDER_COLOR}
        value={username}
        onChangeText={onUsernameChange}
        autoFocus
        editable={!isCreating}
        returnKeyType="done"
        onSubmitEditing={onSubmit}
      />

      <View className="flex-row gap-3">
        <Pressable
          onPress={onCancel}
          disabled={isCreating}
          className="flex-1 bg-gray-200 dark:bg-gray-700 py-3 rounded-xl disabled:opacity-50"
          accessibilityRole="button"
          accessibilityLabel="Cancel profile creation"
        >
          <Text className="text-center text-base font-semibold text-gray-900 dark:text-white">
            Cancel
          </Text>
        </Pressable>

        <Pressable
          onPress={onSubmit}
          disabled={isCreating || !username.trim()}
          className="flex-1 bg-blue-600 py-3 rounded-xl disabled:opacity-50"
          accessibilityRole="button"
          accessibilityLabel="Create new profile"
        >
          <Text className="text-center text-base font-semibold text-white">
            {isCreating ? 'Creating...' : 'Create'}
          </Text>
        </Pressable>
      </View>
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
    setPendingDeleteUser(user);
  };

  if (editingUser) {
    return (
      <AnimatedModal visible={true}>
        <Text className="text-2xl font-bold mb-6 text-gray-900 dark:text-white text-center">
          Edit Profile
        </Text>

        <View className="items-center mb-6">
          <View className="w-24 h-24 rounded-full bg-blue-600 items-center justify-center">
            <Text className="text-5xl">{PROFILE_ICON}</Text>
          </View>
        </View>

        <Text className="text-base font-semibold mb-3 text-gray-900 dark:text-white">Name</Text>

        <TextInput
          className="bg-gray-100 dark:bg-gray-800 px-4 py-3 rounded-xl text-base text-gray-900 dark:text-white mb-6 border border-gray-200 dark:border-gray-700"
          placeholder="Enter name"
          placeholderTextColor={PLACEHOLDER_COLOR}
          value={newUsername}
          onChangeText={setNewUsername}
          autoFocus
          editable={!isUpdating}
          returnKeyType="done"
          onSubmitEditing={handleUpdateUser}
        />

        <View className="flex-row gap-3">
          <Pressable
            onPress={() => setEditingUser(null)}
            disabled={isUpdating}
            className="flex-1 bg-gray-200 dark:bg-gray-700 py-3 rounded-xl disabled:opacity-50"
            accessibilityRole="button"
            accessibilityLabel="Cancel editing"
          >
            <Text className="text-center text-base font-semibold text-gray-900 dark:text-white">
              Cancel
            </Text>
          </Pressable>

          <Pressable
            onPress={handleUpdateUser}
            disabled={isUpdating || !newUsername.trim()}
            className="flex-1 bg-blue-600 py-3 rounded-xl disabled:opacity-50"
            accessibilityRole="button"
            accessibilityLabel="Save changes"
          >
            <Text className="text-center text-base font-semibold text-white">
              {isUpdating ? 'Saving...' : 'Save'}
            </Text>
          </Pressable>
        </View>
      </AnimatedModal>
    );
  }

  return (
    <View className="absolute inset-0 bg-black/80 justify-center items-center px-8">
      <View className="bg-white dark:bg-gray-900 rounded-2xl p-8 w-full max-w-md max-h-[80%]">
        <Text className="text-2xl font-bold mb-6 text-gray-900 dark:text-white text-center">
          Edit Profiles
        </Text>

        <ScrollView className="mb-6" showsVerticalScrollIndicator={false}>
          {users.map((user) => (
            <View key={user.id} className="flex-row items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700">
              <View className="flex-row items-center flex-1">
                <View className="w-12 h-12 rounded-full bg-blue-600 items-center justify-center mr-3">
                  <Text className="text-white font-bold">
                    {user.username
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .toUpperCase()
                      .slice(0, 2)}
                  </Text>
                </View>
                <Text className="text-base font-medium text-gray-900 dark:text-white flex-1">
                  {user.username}
                </Text>
              </View>
              <View className="flex-row gap-2">
                <Pressable
                  onPress={() => handleEditUser(user)}
                  className="px-3 py-2 bg-blue-600 rounded-lg"
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${user.username}`}
                >
                  <Text className="text-sm font-medium text-white">Edit</Text>
                </Pressable>
                {users.length > 1 && (
                  <Pressable
                    onPress={() => handleDeleteUser(user)}
                    className="px-3 py-2 bg-red-600 rounded-lg"
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${user.username}`}
                  >
                    <Text className="text-sm font-medium text-white">Delete</Text>
                  </Pressable>
                )}
              </View>
            </View>
          ))}
        </ScrollView>

        <Pressable
          onPress={onCancel}
          className="bg-gray-200 dark:bg-gray-700 py-3 rounded-xl"
          accessibilityRole="button"
          accessibilityLabel="Close edit profiles"
        >
          <Text className="text-center text-base font-semibold text-gray-900 dark:text-white">
            Done
          </Text>
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
  const currentUser = useUserStore((state) => state.currentUser);
  const switchUser = useUserStore((state) => state.switchUser);
  const createUser = useUserStore((state) => state.createUser);
  const updateUser = useUserStore((state) => state.updateUser);
  const deleteUser = useUserStore((state) => state.deleteUser);

  // Local state
  const [newUsername, setNewUsername] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const isFirstUser = users.length === 0;

  // Event handlers
  const handleSelectUser = useCallback(
    async (userId: string) => {
      if (userId === currentUser?.id) {
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
    [currentUser?.id, switchUser]
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

      // For first user, switch to them and navigate to tabs
      if (isFirstUser) {
        await switchUser(newUser.id);
        router.replace('/(tabs)');
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
    if (userId === currentUser?.id && users.length > 1) {
      const otherUser = users.find(u => u.id !== userId);
      if (otherUser) {
        await switchUser(otherUser.id);
      }
    }
    await deleteUser(userId);
  }, [deleteUser, currentUser?.id, users, switchUser]);

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
    <SafeAreaView className="flex-1 bg-white dark:bg-gray-950" edges={['top']}>
      <UserSelectionScreen
        users={users}
        currentUserId={currentUser?.id}
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
