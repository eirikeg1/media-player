import { HEADER_TEMPLATES, type PageId } from '@/config/header-backgrounds';
import { headerBackgroundRepository } from '@/db/header-background-repository';
import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { ThemedText } from '@/components/ui/display/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useHeaderBackgroundStore } from '@/stores/header-background';
import { useUserStore } from '@/stores/user/user-store';
import type { UserUploadedBackground } from '@/types/theme.types';
import { Image } from 'expo-image';
import { Paths, File, Directory } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { randomUUID } from 'expo-crypto';
import { memo, useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

const PAGE_LABELS: Record<PageId, string> = {
  home: 'Home',
  live: 'Live',
  movies: 'Movies',
  series: 'Series',
  settings: 'Settings',
};

interface BackgroundSectionProps {
  pageId: PageId;
}

export const BackgroundSection = memo(function BackgroundSection({ pageId }: BackgroundSectionProps) {
  const currentUser = useUserStore((s) => s.currentUser);
  const userId = currentUser?.id;

  const selection = useHeaderBackgroundStore((s) => s.selections[pageId]);
  const setSelection = useHeaderBackgroundStore((s) => s.setSelection);
  const resetSelection = useHeaderBackgroundStore((s) => s.resetSelection);
  const registerUploadedUri = useHeaderBackgroundStore((s) => s.registerUploadedUri);
  const removeUploadedUri = useHeaderBackgroundStore((s) => s.removeUploadedUri);

  const tintColor = useThemeColor({}, 'tint');
  const textColor = useThemeColor({}, 'text');

  const [uploads, setUploads] = useState<UserUploadedBackground[]>([]);
  const [sharedUploads, setSharedUploads] = useState<UserUploadedBackground[]>([]);

  // Load uploaded images
  useEffect(() => {
    if (!userId) return;
    const load = async () => {
      const own = await headerBackgroundRepository.getUploadedImages(userId, pageId);
      const shared = await headerBackgroundRepository.getSharedUploadedImages(pageId, userId);
      setUploads(own);
      setSharedUploads(shared);
      // Register URIs in store
      for (const u of [...own, ...shared]) {
        registerUploadedUri(u.id, u.fileUri);
      }
    };
    load();
  }, [userId, pageId, registerUploadedUri]);

  const templates = HEADER_TEMPLATES[pageId];
  const allUploads = [...uploads, ...sharedUploads];

  const handleSelectTemplate = useCallback(
    (key: string) => {
      if (!userId) return;
      setSelection(userId, pageId, 'template', key);
    },
    [userId, pageId, setSelection],
  );

  const handleSelectUploaded = useCallback(
    (id: string) => {
      if (!userId) return;
      setSelection(userId, pageId, 'uploaded', id);
    },
    [userId, pageId, setSelection],
  );

  const handleReset = useCallback(() => {
    if (!userId) return;
    resetSelection(userId, pageId);
  }, [userId, pageId, resetSelection]);

  const handleUpload = useCallback(async () => {
    if (!userId) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
      aspect: [16, 9],
    });

    if (result.canceled || !result.assets[0]) return;

    try {
      const asset = result.assets[0];
      const ext = asset.uri.split('.').pop() ?? 'jpg';
      const destDirectory = new Directory(Paths.document, 'header-backgrounds');
      if (!destDirectory.exists) {
        destDirectory.create();
      }
      const destFile = new File(destDirectory, `${randomUUID()}.${ext}`);
      const sourceFile = new File(asset.uri);
      sourceFile.copy(destFile);
      const destUri = destFile.uri;

      const id = await headerBackgroundRepository.addUploadedImage(userId, pageId, destUri);
      registerUploadedUri(id, destUri);

      // Update local state directly instead of relying on the effect
      setUploads((prev) => [{
        id,
        userId,
        pageId,
        fileUri: destUri,
        createdAt: new Date().toISOString(),
      }, ...prev]);

      // Auto-select the newly uploaded image
      await setSelection(userId, pageId, 'uploaded', id);
    } catch (error) {
      console.error('[BackgroundSection] Upload error:', error);
      Alert.alert('Error', 'Failed to save image. Please try again.');
    }
  }, [userId, pageId, setSelection, registerUploadedUri]);

  const handleDeleteUpload = useCallback(
    (id: string) => {
      Alert.alert('Delete Image', 'Remove this uploaded image?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await headerBackgroundRepository.deleteUploadedImage(id);
            removeUploadedUri(id);
            setUploads((prev) => prev.filter((u) => u.id !== id));
            setSharedUploads((prev) => prev.filter((u) => u.id !== id));
            // If currently selected, reset to default
            if (selection?.type === 'uploaded' && selection.value === id && userId) {
              resetSelection(userId, pageId);
            }
          },
        },
      ]);
    },
    [selection, userId, pageId, resetSelection, removeUploadedUri],
  );

  const isSelected = (type: 'template' | 'uploaded', key: string) => {
    return selection?.type === type && selection.value === key;
  };

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <ThemedText style={styles.sectionTitle}>{PAGE_LABELS[pageId]}</ThemedText>
        {selection && (
          <Pressable onPress={handleReset}>
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
          <Pressable style={styles.uploadButton} onPress={handleUpload}>
            <IconSymbol name="photo.badge.plus" size={28} color={textColor} />
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
                  handleDeleteUpload(upload.id);
                }
              }}
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
