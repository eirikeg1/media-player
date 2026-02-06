import { Input } from '@/components/ui/controls/inputs/input';
import { Textarea } from '@/components/ui/controls/inputs/textarea';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { usePlaylistStore } from '@/states/playlist/playlist-store';
import type { Playlist } from '@/types/playlist.types';
import { memo, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, TouchableOpacity, View } from 'react-native';

interface PlaylistFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
  playlist?: Playlist;
}

/**
 * Form for adding or editing an IPTV playlist with validation.
 * Supports optional authentication credentials.
 */
export const PlaylistForm = memo(function PlaylistForm({ onSuccess, onCancel, playlist }: PlaylistFormProps) {
  const isEditing = !!playlist;
  const [name, setName] = useState(playlist?.name || '');
  const [url, setUrl] = useState(playlist?.url || '');
  const [useCredentials, setUseCredentials] = useState(!!playlist?.credentials);
  const [username, setUsername] = useState(playlist?.credentials?.username || '');
  const [password, setPassword] = useState(playlist?.credentials?.password || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addPlaylist = usePlaylistStore((state) => state.addPlaylist);
  const updatePlaylist = usePlaylistStore((state) => state.updatePlaylist);

  useEffect(() => {
    if (playlist) {
      setName(playlist.name);
      setUrl(playlist.url);
      setUseCredentials(!!playlist.credentials);
      setUsername(playlist.credentials?.username || '');
      setPassword(playlist.credentials?.password || '');
    }
  }, [playlist]);

  const handleSubmit = useCallback(async () => {
    console.log('[PlaylistForm] Submit started', { isEditing });
    setError(null);

    if (!name.trim()) {
      console.warn('[PlaylistForm] Validation failed: name is empty');
      setError('Please enter a playlist name');
      return;
    }

    if (!url.trim()) {
      console.warn('[PlaylistForm] Validation failed: URL is empty');
      setError('Please enter a playlist URL');
      return;
    }

    if (useCredentials && (!username.trim() || !password.trim())) {
      console.warn('[PlaylistForm] Validation failed: credentials incomplete');
      setError('Please enter both username and password');
      return;
    }

    console.log('[PlaylistForm] Validation passed, submitting:', {
      name: name.trim(),
      urlLength: url.trim().length,
      hasCredentials: useCredentials,
    });

    setIsSubmitting(true);

    try {
      if (isEditing && playlist) {
        await updatePlaylist(playlist.id, {
          name: name.trim(),
          url: url.trim(),
          credentials: useCredentials
            ? { username: username.trim(), password: password.trim() }
            : undefined,
        });
        console.log('[PlaylistForm] Playlist updated successfully');
      } else {
        await addPlaylist({
          name: name.trim(),
          url: url.trim(),
          credentials: useCredentials
            ? { username: username.trim(), password: password.trim() }
            : undefined,
        });
        console.log('[PlaylistForm] Playlist added successfully');
      }

      if (!isEditing) {
        setName('');
        setUrl('');
        setUsername('');
        setPassword('');
        setUseCredentials(false);
      }

      onSuccess?.();
    } catch (err) {
      console.error('[PlaylistForm] Error:', err);
      const errorMessage = err instanceof Error ? err.message : `Failed to ${isEditing ? 'update' : 'add'} playlist`;
      console.error('[PlaylistForm] Error message:', errorMessage);
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
      console.log('[PlaylistForm] Submit completed');
    }
  }, [name, url, useCredentials, username, password, addPlaylist, updatePlaylist, onSuccess, isEditing, playlist]);

  return (
    <ThemedView style={styles.container}>
      {error && (
        <View style={styles.errorContainer}>
          <ThemedText style={styles.errorText}>⚠️ {error}</ThemedText>
        </View>
      )}

      {isSubmitting && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <ThemedText style={styles.loadingText}>
            Fetching and parsing playlist... This may take a moment.
          </ThemedText>
        </View>
      )}

      <View style={styles.formGroup}>
        <ThemedText style={styles.label}>Playlist Name</ThemedText>
        <Input
          value={name}
          onChangeText={setName}
          placeholder="e.g., My IPTV Playlist"
          editable={!isSubmitting}
          accessibilityLabel="Playlist name"
          accessibilityHint="Enter a name for your IPTV playlist"
          returnKeyType="next"
          error={!!error && !name.trim()}
        />
      </View>

      <View style={styles.formGroup}>
        <ThemedText style={styles.label}>Playlist URL</ThemedText>
        <Textarea
          value={url}
          onChangeText={setUrl}
          placeholder="https://example.com/playlist.m3u"
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isSubmitting}
          accessibilityLabel="Playlist URL"
          accessibilityHint="Enter the M3U playlist URL"
          returnKeyType="next"
          textContentType="URL"
          error={!!error && !url.trim()}
        />
        <ThemedText style={styles.helpText}>
          If your URL contains username/password parameters, paste the full URL and skip authentication below
        </ThemedText>
      </View>

      <View style={styles.switchContainer}>
        <View style={styles.switchLabelContainer}>
          <ThemedText style={styles.label}>HTTP Basic Auth</ThemedText>
          <ThemedText style={styles.helpText}>Only for HTTP Basic Authentication</ThemedText>
        </View>
        <Switch
          value={useCredentials}
          onValueChange={setUseCredentials}
          disabled={isSubmitting}
          accessibilityLabel="Requires authentication"
          accessibilityHint="Toggle if the playlist requires HTTP Basic Auth"
        />
      </View>

      {useCredentials && (
        <>
          <View style={styles.formGroup}>
            <ThemedText style={styles.label}>Username</ThemedText>
            <Input
              value={username}
              onChangeText={setUsername}
              placeholder="Username"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isSubmitting}
              accessibilityLabel="Username"
              accessibilityHint="Enter your playlist username"
              returnKeyType="next"
              textContentType="username"
              error={!!error && useCredentials && !username.trim()}
            />
          </View>

          <View style={styles.formGroup}>
            <ThemedText style={styles.label}>Password</ThemedText>
            <Input
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isSubmitting}
              accessibilityLabel="Password"
              accessibilityHint="Enter your playlist password"
              returnKeyType="done"
              textContentType="password"
              error={!!error && useCredentials && !password.trim()}
            />
          </View>
        </>
      )}

      <View style={styles.buttonContainer}>
        {onCancel && (
          <TouchableOpacity
            style={[styles.button, styles.cancelButton]}
            onPress={onCancel}
            disabled={isSubmitting}
            accessibilityLabel="Cancel"
            accessibilityHint="Cancel adding playlist"
            accessibilityRole="button"
          >
            <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[
            styles.button,
            styles.submitButton,
            isSubmitting && styles.submitButtonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={isSubmitting}
          accessibilityLabel={isEditing ? 'Update playlist' : 'Add playlist'}
          accessibilityHint="Submit the playlist form"
          accessibilityRole="button"
          accessibilityState={{ disabled: isSubmitting }}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" accessibilityLabel="Loading" />
          ) : (
            <ThemedText style={styles.submitButtonText}>
              {isEditing ? 'Update Playlist' : 'Add Playlist'}
            </ThemedText>
          )}
        </TouchableOpacity>
      </View>
    </ThemedView>
  );
});

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    marginBottom: 8,
    fontWeight: '600',
  },
  helpText: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 6,
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  switchLabelContainer: {
    flex: 1,
  },
  errorContainer: {
    backgroundColor: '#fee',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#fcc',
  },
  errorText: {
    color: '#c33',
    fontSize: 14,
    fontWeight: '600',
  },
  loadingContainer: {
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#f0f8ff',
    borderRadius: 8,
  },
  loadingText: {
    fontSize: 14,
    color: '#007AFF',
    textAlign: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  button: {
    flex: 1,
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#666',
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: '#007AFF',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
