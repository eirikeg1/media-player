import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { GlassColors } from '@/lib/theme';
import type { Playlist } from '@/types/playlist.types';
import { memo } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlaylistForm } from './playlist-form';

interface PlaylistModalProps {
  visible: boolean;
  onClose: () => void;
  playlist?: Playlist;
}

/**
 * Modal for adding or editing a playlist with proper keyboard handling.
 * Ensures input fields are never covered by the keyboard.
 */
export const PlaylistModal = memo(function PlaylistModal({ visible, onClose, playlist }: PlaylistModalProps) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const isEditing = !!playlist;
  const borderColor = isDark ? GlassColors.dark.border : GlassColors.light.border;
  const iconColor = useThemeColor({ light: '#000', dark: '#fff' }, 'icon');

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <ThemedView style={[styles.modalContent, { paddingTop: insets.top }]}>
        <View style={[styles.header, { borderBottomColor: borderColor }]}>
          <ThemedText type="subtitle" style={styles.headerTitle}>
            {isEditing ? 'Edit Playlist' : 'Add New Playlist'}
          </ThemedText>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel="Close modal"
            accessibilityHint={`Close the ${isEditing ? 'edit' : 'add'} playlist modal`}
          >
            <IconSymbol name="xmark" size={24} color={iconColor} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={true}
          automaticallyAdjustKeyboardInsets
        >
          <PlaylistForm onSuccess={onClose} onCancel={onClose} playlist={playlist} />
        </ScrollView>
      </ThemedView>
    </Modal>
  );
});

const styles = StyleSheet.create({
  modalContent: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 20,
  },
  closeButton: {
    padding: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
});
