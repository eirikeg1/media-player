import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/display/themed-text';
import { getInitials } from '@/features/user/get-initials';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { User } from '@/types/user.types';

const AVATAR_SIZE = 128;

interface UserProfileCardProps {
  user: User;
  isCurrentUser?: boolean;
  onPress: () => void;
}

/**
 * User profile card component for selection screen
 */
export function UserProfileCard({ user, isCurrentUser, onPress }: UserProfileCardProps) {
  const tintColor = useThemeColor({}, 'tint');
  const mutedColor = useThemeColor({}, 'muted');

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, { opacity: pressed ? 0.7 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={
        isCurrentUser ? `${user.username} (current profile)` : `Switch to ${user.username}`
      }
      accessibilityState={{ selected: isCurrentUser }}
    >
      <View
        style={[
          styles.avatar,
          // An avatar image is not supported yet, so the placeholder for one is
          // deliberately neutral rather than the accent used for initials.
          { backgroundColor: user.avatarUrl ? mutedColor : tintColor },
        ]}
      >
        <ThemedText style={styles.initials}>{getInitials(user.username)}</ThemedText>
      </View>
      {isCurrentUser ? (
        <View style={[styles.currentBadge, { backgroundColor: tintColor }]}>
          <ThemedText style={[styles.username, styles.usernameOnAccent]}>
            {user.username}
          </ThemedText>
        </View>
      ) : (
        <ThemedText style={styles.username}>{user.username}</ThemedText>
      )}
    </Pressable>
  );
}

/**
 * Add new user card component
 */
export function AddUserCard({ onPress }: { onPress: () => void }) {
  const mutedColor = useThemeColor({}, 'muted');

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, { opacity: pressed ? 0.7 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel="Add user profile"
    >
      <View style={[styles.avatar, styles.addAvatar, { borderColor: mutedColor }]}>
        <ThemedText style={[styles.addGlyph, { color: mutedColor }]}>+</ThemedText>
      </View>
      <ThemedText style={[styles.username, { color: mutedColor }]}>Add User</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  addAvatar: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  addGlyph: {
    fontSize: 60,
    lineHeight: 68,
  },
  initials: {
    fontSize: 36,
    lineHeight: 44,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  username: {
    fontSize: 18,
    fontWeight: '600',
  },
  usernameOnAccent: {
    color: '#FFFFFF',
  },
  currentBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
});
