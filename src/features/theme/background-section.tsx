import { ConfirmDialog } from '@/components/ui/containers/modal/confirm-dialog';
import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { Spinner } from '@/components/ui/display/state';
import { ThemedText } from '@/components/ui/display/themed-text';
import { HEADER_TEMPLATES, type PageId } from '@/config/header-backgrounds';
import { headerBackgroundRepository } from '@/db/header-background-repository';
import { useHaptics } from '@/hooks/use-haptics';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useHeaderBackgroundStore } from '@/stores/header-background';
import { useUserStore } from '@/stores/user/user-store';
import type { UserUploadedBackground } from '@/types/theme.types';
import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  InteractionManager,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

const PAGE_LABELS: Record<PageId, string> = {
  home: 'Home',
  live: 'Live',
  movies: 'Movies',
  series: 'Series',
  settings: 'Settings',
};

/** File extension per picker MIME type; the picker's URI has none on Android. */
const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/gif': 'gif',
};

/**
 * The extension to store a picked image under.
 *
 * Derived from the asset's MIME type, never from its URI: a `content://` URI
 * (every Android gallery pick) has no extension, and splitting it on "." yields
 * a fragment of the document id.
 */
function imageExtension(mimeType: string | undefined): string {
  if (!mimeType) return 'jpg';
  const known = IMAGE_EXTENSIONS[mimeType.toLowerCase()];
  if (known) return known;
  const subtype = mimeType.split('/')[1]?.replace(/[^a-z0-9]/gi, '');
  return subtype || 'jpg';
}

/** Let the busy indicator paint before running work that blocks the JS thread. */
function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    InteractionManager.runAfterInteractions(() => resolve());
  });
}

interface BackgroundSectionProps {
  pageId: PageId;
}

export const BackgroundSection = memo(function BackgroundSection({ pageId }: BackgroundSectionProps) {
  const userId = useUserStore((s) => s.currentUser?.id);

  const selection = useHeaderBackgroundStore((s) => s.selections[pageId]);
  const uploadedUris = useHeaderBackgroundStore((s) => s.uploadedUris);
  const setSelection = useHeaderBackgroundStore((s) => s.setSelection);
  const resetSelection = useHeaderBackgroundStore((s) => s.resetSelection);
  const registerUploadedUri = useHeaderBackgroundStore((s) => s.registerUploadedUri);
  const deleteUploadedImage = useHeaderBackgroundStore((s) => s.deleteUploadedImage);

  const tintColor = useThemeColor({}, 'tint');
  const haptics = useHaptics();

  const [uploads, setUploads] = useState<UserUploadedBackground[]>([]);
  const [sharedUploads, setSharedUploads] = useState<UserUploadedBackground[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // Load uploaded images
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const load = async () => {
      try {
        const own = await headerBackgroundRepository.getUploadedImages(userId, pageId);
        const shared = await headerBackgroundRepository.getSharedUploadedImages(pageId, userId);
        if (cancelled) return;
        setUploads(own);
        setSharedUploads(shared);
        // Register URIs in store
        for (const u of [...own, ...shared]) {
          registerUploadedUri(u.id, u.fileUri);
        }
      } catch (error) {
        console.error('[BackgroundSection] Failed to load uploaded images:', error);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [userId, pageId, registerUploadedUri]);

  const templates = HEADER_TEMPLATES[pageId];

  // The store holds every upload that still exists, and a delete removes the id
  // from it for good. Filtering the lists this section loaded through it means a
  // delete performed anywhere — another section, another page — disappears here
  // too, instead of leaving a thumbnail pointing at a deleted file.
  const allUploads = useMemo(
    () => [...uploads, ...sharedUploads].filter((upload) => upload.id in uploadedUris),
    [uploads, sharedUploads, uploadedUris],
  );

  const handleSelectTemplate = useCallback(
    async (key: string) => {
      if (!userId) return;
      try {
        await setSelection(userId, pageId, 'template', key);
      } catch {
        Alert.alert('Error', 'Failed to save background. Please try again.');
      }
    },
    [userId, pageId, setSelection],
  );

  const handleSelectUploaded = useCallback(
    async (id: string) => {
      if (!userId) return;
      try {
        await setSelection(userId, pageId, 'uploaded', id);
      } catch {
        Alert.alert('Error', 'Failed to save background. Please try again.');
      }
    },
    [userId, pageId, setSelection],
  );

  const handleReset = useCallback(async () => {
    if (!userId) return;
    try {
      await resetSelection(userId, pageId);
    } catch {
      Alert.alert('Error', 'Failed to reset background. Please try again.');
    }
  }, [userId, pageId, resetSelection]);

  const handleUpload = useCallback(async () => {
    if (!userId || isUploading) return;

    // Claimed before the picker opens: the picker is a slow async round trip,
    // and a second tap while it is up would open a second one.
    setIsUploading(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: true,
        aspect: [16, 9],
      });

      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      const destDirectory = new Directory(Paths.document, 'header-backgrounds');
      if (!destDirectory.exists) {
        destDirectory.create();
      }
      const destFile = new File(destDirectory, `${randomUUID()}.${imageExtension(asset.mimeType)}`);

      // `File.copy` is synchronous in expo-file-system 19 — there is no async
      // copy to await — so let the spinner render before it blocks the thread.
      await yieldToUi();
      new File(asset.uri).copy(destFile);
      const destUri = destFile.uri;

      const id = await headerBackgroundRepository.addUploadedImage(userId, pageId, destUri);
      registerUploadedUri(id, destUri);

      // Update local state directly instead of relying on the effect
      setUploads((prev) => [
        {
          id,
          userId,
          pageId,
          fileUri: destUri,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);

      // Auto-select the newly uploaded image
      await setSelection(userId, pageId, 'uploaded', id);
    } catch (error) {
      console.error('[BackgroundSection] Upload error:', error);
      Alert.alert('Error', 'Failed to save image. Please try again.');
    } finally {
      setIsUploading(false);
    }
  }, [userId, pageId, isUploading, setSelection, registerUploadedUri]);

  const handleConfirmDelete = useCallback(async () => {
    const id = pendingDeleteId;
    if (!id) return;

    try {
      // The store drops the id, which is what removes the thumbnail here and in
      // every other section showing it.
      await deleteUploadedImage(id);
    } catch (error) {
      console.error('[BackgroundSection] Delete error:', error);
      Alert.alert('Error', 'Failed to delete image. Please try again.');
    } finally {
      setPendingDeleteId(null);
    }
  }, [pendingDeleteId, deleteUploadedImage]);

  const isSelected = (type: 'template' | 'uploaded', key: string) => {
    return selection?.type === type && selection.value === key;
  };

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <ThemedText style={styles.sectionTitle}>{PAGE_LABELS[pageId]}</ThemedText>
        {selection && (
          <Pressable
            onPress={handleReset}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Reset ${PAGE_LABELS[pageId]} background`}
          >
            <ThemedText style={[styles.resetText, { color: tintColor }]}>Reset</ThemedText>
          </Pressable>
        )}
      </View>

      {/* Templates row */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {templates.map((template) => (
          <Pressable
            key={template.key}
            style={[
              styles.thumbnail,
              isSelected('template', template.key) && { borderColor: tintColor, borderWidth: 2 },
            ]}
            onPress={() => handleSelectTemplate(template.key)}
            accessibilityRole="button"
            accessibilityLabel={`Use background ${template.key}`}
            accessibilityState={{ selected: isSelected('template', template.key) }}
          >
            <Image source={template.source} style={styles.thumbnailImage} contentFit="cover" />
            {isSelected('template', template.key) && (
              <View style={styles.checkOverlay}>
                <IconSymbol name="checkmark.circle.fill" size={24} color={tintColor} />
              </View>
            )}
          </Pressable>
        ))}
      </ScrollView>

      {/* Uploaded images row */}
      {(allUploads.length > 0 || userId) && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {/* Upload button */}
          <Pressable
            style={styles.uploadButton}
            onPress={handleUpload}
            disabled={isUploading}
            accessibilityRole="button"
            accessibilityLabel="Upload background image"
            accessibilityState={{ disabled: isUploading }}
          >
            {isUploading ? (
              <Spinner color="rgba(128,128,128,0.8)" />
            ) : (
              <IconSymbol name="plus" size={28} color="rgba(128,128,128,0.5)" />
            )}
          </Pressable>

          {allUploads.map((upload) => (
            <Pressable
              key={upload.id}
              style={[
                styles.thumbnail,
                isSelected('uploaded', upload.id) && { borderColor: tintColor, borderWidth: 2 },
              ]}
              onPress={() => handleSelectUploaded(upload.id)}
              onLongPress={() => {
                // Only allow deleting own uploads
                if (upload.userId === userId) {
                  haptics.warning();
                  setPendingDeleteId(upload.id);
                }
              }}
              accessibilityRole="button"
              accessibilityLabel="Uploaded background image"
              accessibilityHint={
                upload.userId === userId ? 'Long press to delete this image' : undefined
              }
              accessibilityState={{ selected: isSelected('uploaded', upload.id) }}
            >
              <Image source={{ uri: upload.fileUri }} style={styles.thumbnailImage} contentFit="cover" />
              {isSelected('uploaded', upload.id) && (
                <View style={styles.checkOverlay}>
                  <IconSymbol name="checkmark.circle.fill" size={24} color={tintColor} />
                </View>
              )}
              {upload.userId !== userId && (
                <View style={styles.sharedBadge}>
                  <IconSymbol name="person.2.fill" size={12} color="#fff" />
                </View>
              )}
            </Pressable>
          ))}
        </ScrollView>
      )}

      <ConfirmDialog
        visible={pendingDeleteId !== null}
        title="Delete Image"
        message="Remove this uploaded image? Anyone you share backgrounds with loses it too."
        actions={[
          { title: 'Cancel', onPress: () => setPendingDeleteId(null) },
          { title: 'Delete', variant: 'danger', onPress: handleConfirmDelete },
        ]}
      />
    </View>
  );
});

const THUMBNAIL_WIDTH = 120;
const THUMBNAIL_HEIGHT = 68;

const styles = StyleSheet.create({
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  resetText: {
    fontSize: 14,
    fontWeight: '500',
  },
  row: {
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 4,
  },
  thumbnail: {
    width: THUMBNAIL_WIDTH,
    height: THUMBNAIL_HEIGHT,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(128,128,128,0.3)',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  checkOverlay: {
    position: 'absolute',
    top: 4,
    right: 4,
  },
  sharedBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 8,
    padding: 2,
  },
  uploadButton: {
    width: THUMBNAIL_WIDTH,
    height: THUMBNAIL_HEIGHT,
    borderRadius: 8,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(128,128,128,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
