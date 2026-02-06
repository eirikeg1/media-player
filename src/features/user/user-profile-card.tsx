import type { User } from '@/types/user.types';
import { Pressable, Text, View } from 'react-native';

interface UserProfileCardProps {
  user: User;
  onPress: () => void;
}

/**
 * User profile card component for selection screen
 */
export function UserProfileCard({ user, onPress }: UserProfileCardProps) {
  // Get initials from username
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Pressable
      onPress={onPress}
      className="items-center"
      style={({ pressed }) => [
        { opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <View className="mb-3">
        {user.avatarUrl ? (
          <View className="w-32 h-32 rounded-2xl overflow-hidden bg-gray-700">
            {/* TODO: Add Image component when avatar URL is supported */}
            <View className="w-full h-full items-center justify-center">
              <Text className="text-4xl font-bold text-white">
                {getInitials(user.username)}
              </Text>
            </View>
          </View>
        ) : (
          <View className="w-32 h-32 rounded-2xl bg-blue-600 items-center justify-center">
            <Text className="text-4xl font-bold text-white">
              {getInitials(user.username)}
            </Text>
          </View>
        )}
      </View>
      <Text className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        {user.username}
      </Text>
    </Pressable>
  );
}

/**
 * Add new user card component
 */
export function AddUserCard({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="items-center"
      style={({ pressed }) => [
        { opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <View className="mb-3">
        <View className="w-32 h-32 rounded-2xl border-2 border-dashed border-gray-400 dark:border-gray-600 items-center justify-center">
          <Text className="text-6xl text-gray-400 dark:text-gray-600">+</Text>
        </View>
      </View>
      <Text className="text-lg font-semibold text-gray-600 dark:text-gray-400">
        Add User
      </Text>
    </Pressable>
  );
}
