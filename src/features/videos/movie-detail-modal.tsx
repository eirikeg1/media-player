import { Button } from '@/components/ui/controls/button';
import { ModalHeader } from '@/components/ui/containers/modal/modal-header';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { CategoryPill } from '@/features/videos/category-pill';
import { MetadataSection } from '@/features/videos/components/metadata-section';
import { useMovieMetadata } from '@/features/videos/hooks/use-movie-metadata';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { Channel } from '@/types/playlist.types';
import { useEffect, useMemo, useState } from 'react';
import { Image, Modal, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface MovieDetailModalProps {
  visible: boolean;
  onClose: () => void;
  movie: Channel | null;
  playlistId: string | null | undefined;
  onPlayPress: (channel: Channel) => void;
}

export function MovieDetailModal({
  visible,
  onClose,
  movie,
  playlistId,
  onPlayPress,
}: MovieDetailModalProps) {
  const [imageError, setImageError] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(2 / 3);
  const insets = useSafeAreaInsets();
  const tintColor = useThemeColor({}, 'tint');

  useEffect(() => {
    setImageError(false);
    setAspectRatio(2 / 3);
  }, [movie?.name]);

  const { metadata, isLoading } = useMovieMetadata(
    playlistId,
    movie?.url,
    visible
  );

  const posterUrl = movie?.tvg.logo || metadata?.backdropPath;

  useEffect(() => {
    if (posterUrl) {
      Image.getSize(posterUrl, (w, h) => setAspectRatio(w / h));
    }
  }, [posterUrl]);

  // Split groupName by common separators for category pills
  const categories = useMemo(() => {
    if (!movie?.group.title) return [];
    return movie.group.title
      .split(/\s*[|/]\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
  }, [movie?.group.title]);

  if (!movie) return null;

  const handlePlay = () => {
    onPlayPress(movie);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <ModalHeader
          title={movie.name}
          subtitle={movie.group.title}
          onClose={onClose}
        />

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Poster */}
          {posterUrl && !imageError ? (
            <Image
              source={{ uri: posterUrl }}
              style={[
                styles.posterBase,
                { aspectRatio, maxWidth: '90%' },
              ]}
              resizeMode="cover"
              onError={() => setImageError(true)}
            />
          ) : (
            <ThemedView style={[styles.fallbackPoster]}>
              <ThemedText style={styles.fallbackText}>
                {movie.name.charAt(0).toUpperCase()}
              </ThemedText>
            </ThemedView>
          )}

          {/* Category pills */}
          {categories.length > 0 && (
            <View style={styles.pillRow}>
              {categories.map((cat) => (
                <CategoryPill key={cat} label={cat} />
              ))}
            </View>
          )}

          {/* Metadata */}
          <MetadataSection
            metadata={metadata}
            isLoading={isLoading}
            tintColor={tintColor}
          />

          {/* Play button */}
          <View style={styles.playButtonContainer}>
            <Button
              title="Play"
              icon="play.fill"
              variant="primary"
              size="large"
              fullWidth
              onPress={handlePlay}
            />
          </View>
        </ScrollView>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  posterBase: {
    height: 240,
    borderRadius: 8,
    alignSelf: 'center',
    marginVertical: 16,
  },
  fallbackPoster: {
    width: 180,
    height: 240,
    borderRadius: 8,
    alignSelf: 'center',
    marginVertical: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fallbackText: {
    fontSize: 40,
    fontWeight: '600',
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    marginBottom: 16,
    justifyContent: 'center',
    gap: 6,
  },
  playButtonContainer: {
    paddingHorizontal: 16,
    marginTop: 24,
  },
});
