import { ModalHeader } from '@/components/ui/containers/modal/modal-header';
import { ThemedView } from '@/components/ui/display/themed-view';
import type { PageId } from '@/config/header-backgrounds';
import { useUserStore } from '@/stores/user/user-store';
import { memo, useCallback } from 'react';
import { Modal, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackgroundSection } from './background-section';
import { ThemedText } from '@/components/ui/display/themed-text';

const PAGE_IDS: PageId[] = ['home', 'live', 'movies', 'series', 'settings'];

interface CustomizeThemeModalProps {
  visible: boolean;
  onClose: () => void;
}

export const CustomizeThemeModal = memo(function CustomizeThemeModal({
  visible,
  onClose,
}: CustomizeThemeModalProps) {
  const insets = useSafeAreaInsets();
  const currentUser = useUserStore((s) => s.currentUser);
  const updateSettings = useUserStore((s) => s.updateSettings);

  const shareUploads = currentUser?.settings?.shareUploadedBackgrounds ?? true;

  const handleToggleShare = useCallback(
    (value: boolean) => {
      if (!currentUser) return;
      updateSettings(currentUser.id, { shareUploadedBackgrounds: value });
    },
    [currentUser, updateSettings],
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <ModalHeader title="Page Header Backgrounds" onClose={onClose} />

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {/* Share toggle */}
          <View style={styles.shareRow}>
            <View style={styles.shareLabelContainer}>
              <ThemedText style={styles.shareLabel}>Share uploaded images with users</ThemedText>
            </View>
            <Switch
              value={shareUploads}
              onValueChange={handleToggleShare}
              trackColor={{ false: '#767577', true: '#007AFF' }}
              accessibilityLabel="Share uploaded background images with other users"
            />
          </View>

          {/* Background sections for each page */}
          {PAGE_IDS.map((pageId) => (
            <BackgroundSection key={pageId} pageId={pageId} />
          ))}
        </ScrollView>
      </ThemedView>
    </Modal>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 8,
  },
  shareLabelContainer: {
    flex: 1,
    marginRight: 12,
  },
  shareLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
});
