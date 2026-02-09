import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { useUserStore } from '@/stores/user/user-store';
import { router } from 'expo-router';
import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

/**
 * User settings and profile management component
 */
export const UserSettings = memo(function UserSettings() {
  const currentUser = useUserStore((state) => state.currentUser);

  const handleSwitchUser = useCallback(() => {
    // Navigate to the user selection screen
    router.push('/user-select');
  }, []);

  if (!currentUser) {
    return null;
  }

  return (
    <ThemedView style={styles.container}>
      {/* Current User Section */}
      <View style={styles.content}>
        <ThemedText type="subtitle" style={styles.header}>
          Profile
        </ThemedText>

        <Pressable
          onPress={handleSwitchUser}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          accessibilityLabel="Switch user profile"
          accessibilityRole="button"
        >
          <View style={styles.userCard}>
            <View style={[styles.avatar, { backgroundColor: '#007AFF' }]}>
              <ThemedText style={styles.avatarText}>
                {currentUser.username
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2)}
              </ThemedText>
            </View>
            <ThemedText style={styles.username}>{currentUser.username}</ThemedText>
            <IconSymbol name="arrow.up.arrow.down" size={28} color="#007AFF" />
          </View>
        </Pressable>
      </View>
    </ThemedView>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 0,
  },
  header: {
    marginBottom: 8,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    gap: 12,
    backgroundColor: 'transparent',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  username: {
    fontSize: 17,
    fontWeight: '600',
  },
});
