import { Dropdown } from '@/components/ui/controls/inputs/dropdown';
import { Input } from '@/components/ui/controls/inputs/input';
import { Textarea } from '@/components/ui/controls/inputs/textarea';
import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { generatePlaylistId } from '@/lib/playlist-utils';
import {
  DEFAULT_EPG_SYNC_MINUTES,
  DEFAULT_PLAYLIST_SYNC_MINUTES,
  SYNC_INTERVAL_OPTIONS,
} from '@/lib/sync-intervals';
import { GlassColors, TINT } from '@/lib/theme';
import { Spinner } from '@/components/ui/display/state';
import { useImportProgress } from '@/stores/playlist/import-progress-store';
import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import type { Playlist } from '@/types/playlist.types';
import { memo, useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet, Switch, TouchableOpacity, View } from 'react-native';
import { ImportProgressBar } from './import-progress-bar';

/**
 * Background work is Android-only (see the sports refresh settings), so on iOS
 * the automatic syncs only happen while the app is open.
 */
const BACKGROUND_SYNC_NOTE =
  Platform.OS === 'ios'
    ? 'Runs while the app is open.'
    : 'Runs while the app is open, and in the background \u2014 on Wi\u2011Fi only, unless \u201cSync on mobile data\u201d is on in Settings.';

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
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const isEditing = !!playlist;
  const [name, setName] = useState(playlist?.name || '');
  const [url, setUrl] = useState(playlist?.url || '');
  const [useCredentials, setUseCredentials] = useState(!!playlist?.credentials);
  const [username, setUsername] = useState(playlist?.credentials?.username || '');
  const [password, setPassword] = useState(playlist?.credentials?.password || '');
  const [epgUrl, setEpgUrl] = useState(playlist?.epgUrl || '');
  // `??`, never `||`: a stored 0 is the user's "Off", not a missing value.
  const [syncInterval, setSyncInterval] = useState<number>(
    playlist?.syncInterval ?? DEFAULT_PLAYLIST_SYNC_MINUTES,
  );
  const [epgSyncInterval, setEpgSyncInterval] = useState<number>(
    playlist?.epgSyncInterval ?? DEFAULT_EPG_SYNC_MINUTES,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addPlaylist = usePlaylistStore((state) => state.addPlaylist);
  const updatePlaylist = usePlaylistStore((state) => state.updatePlaylist);
  // The id whose import this form is showing: the playlist being edited, or the
  // one this form generated for the playlist it is adding. Never another
  // playlist's — a background sync must not appear as this form's progress.
  const [addedPlaylistId, setAddedPlaylistId] = useState(generatePlaylistId);
  const importedPlaylistId = playlist?.id ?? addedPlaylistId;
  const phaseLabel = useImportProgress(importedPlaylistId)?.phaseLabel;

  useEffect(() => {
    if (playlist) {
      setName(playlist.name);
      setUrl(playlist.url);
      setEpgUrl(playlist.epgUrl || '');
      setSyncInterval(playlist.syncInterval ?? DEFAULT_PLAYLIST_SYNC_MINUTES);
      setEpgSyncInterval(playlist.epgSyncInterval ?? DEFAULT_EPG_SYNC_MINUTES);
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
      const trimmedEpgUrl = epgUrl.trim() || undefined;

      if (isEditing && playlist) {
        await updatePlaylist(playlist.id, {
          name: name.trim(),
          url: url.trim(),
          epgUrl: trimmedEpgUrl,
          syncInterval,
          epgSyncInterval,
          credentials: useCredentials
            ? { username: username.trim(), password: password.trim() }
            : undefined,
        });
        console.log('[PlaylistForm] Playlist updated successfully');
      } else {
        await addPlaylist({
          id: addedPlaylistId,
          name: name.trim(),
          url: url.trim(),
          epgUrl: trimmedEpgUrl,
          syncInterval,
          epgSyncInterval,
          credentials: useCredentials
            ? { username: username.trim(), password: password.trim() }
            : undefined,
        });
        console.log('[PlaylistForm] Playlist added successfully');
      }

      if (!isEditing) {
        setName('');
        setUrl('');
        setEpgUrl('');
        setUsername('');
        setPassword('');
        setUseCredentials(false);
        setSyncInterval(DEFAULT_PLAYLIST_SYNC_MINUTES);
        setEpgSyncInterval(DEFAULT_EPG_SYNC_MINUTES);
        // The id is spent: the next playlist added from this form needs its own.
        setAddedPlaylistId(generatePlaylistId());
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
  }, [name, url, epgUrl, syncInterval, epgSyncInterval, useCredentials, username, password, addedPlaylistId, addPlaylist, updatePlaylist, onSuccess, isEditing, playlist]);

  return (
    <ThemedView style={styles.container}>
      {error && (
        <View style={[styles.errorBanner, { backgroundColor: isDark ? '#4a1a1a' : '#fee' }]}>
          <IconSymbol name="exclamationmark.triangle" size={20} color="#c33" />
          <ThemedText style={styles.errorText}>{error}</ThemedText>
        </View>
      )}

      {isSubmitting && (
        <View style={[styles.loadingContainer, {
          backgroundColor: isDark ? GlassColors.dark.surface : GlassColors.light.surface,
        }]}>
          <View style={styles.loadingHeader}>
            <Spinner />
            <ThemedText style={styles.loadingText}>
              {phaseLabel ?? 'Saving playlist...'}
            </ThemedText>
          </View>
          <ImportProgressBar playlistId={importedPlaylistId} />
          {/* An edit that changes neither URL nor credentials only writes
              metadata — there is no download to warn about. */}
          {phaseLabel !== undefined && (
            <ThemedText style={styles.loadingHelpText}>
              Please do not close the app during import.
            </ThemedText>
          )}
        </View>
      )}

      <View style={styles.formGroup}>
        <ThemedText style={styles.label}>Playlist Name</ThemedText>
        <Input
          testID="playlist-name-input"
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
          testID="playlist-url-input"
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

      <View style={styles.formGroup}>
        <ThemedText style={styles.label}>EPG / XMLTV URL</ThemedText>
        <Textarea
          value={epgUrl}
          onChangeText={setEpgUrl}
          placeholder="https://example.com/xmltv.php"
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isSubmitting}
          accessibilityLabel="EPG URL"
          accessibilityHint="Enter an optional XMLTV EPG URL"
          returnKeyType="next"
          textContentType="URL"
        />
        <ThemedText style={styles.helpText}>
          Optional. Auto-detected for Xtream providers.
        </ThemedText>
      </View>

      <View style={styles.formGroup}>
        <Dropdown<number>
          label="Auto Sync"
          options={SYNC_INTERVAL_OPTIONS}
          value={syncInterval}
          onSelect={setSyncInterval}
          disabled={isSubmitting}
          accessibilityLabel="Playlist auto sync interval"
        />
        <ThemedText style={styles.helpText}>
          Re-download the channel list at this interval, so renamed event channels stay current.{' '}
          {BACKGROUND_SYNC_NOTE}
        </ThemedText>
      </View>

      <View style={styles.formGroup}>
        <Dropdown<number>
          label="EPG Auto Sync"
          options={SYNC_INTERVAL_OPTIONS}
          value={epgSyncInterval}
          onSelect={setEpgSyncInterval}
          disabled={isSubmitting}
          accessibilityLabel="EPG auto sync interval"
        />
        <ThemedText style={styles.helpText}>
          Re-download the programme guide at this interval. {BACKGROUND_SYNC_NOTE}
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
            style={[styles.button, styles.cancelButton, {
              backgroundColor: isDark ? GlassColors.dark.surfaceElevated : GlassColors.light.surfaceElevated,
            }]}
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
          testID="playlist-submit-button"
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
            <Spinner color="#fff" />
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
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  errorText: {
    flex: 1,
    color: '#c33',
    fontSize: 14,
  },
  loadingContainer: {
    padding: 16,
    marginBottom: 16,
    gap: 8,
    borderRadius: 8,
  },
  loadingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
    color: TINT,
  },
  loadingHelpText: {
    fontSize: 12,
    opacity: 0.6,
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
  cancelButton: {},
  cancelButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: TINT,
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
