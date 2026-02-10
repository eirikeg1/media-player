import { ModalHeader } from '@/components/ui/containers/modal/modal-header';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { CategoryPill } from '@/features/videos/category-pill';
import { MetadataSection } from '@/features/videos/components/metadata-section';
import { SeasonAccordion } from '@/features/videos/season-accordion';
import { useSeriesEpisodes } from '@/features/videos/hooks/use-series-episodes';
import { useSeriesMetadata } from '@/features/videos/hooks/use-series-metadata';
import { useThemeColor } from '@/hooks/use-theme-color';
import { groupEpisodesBySeason } from '@/lib/series-utils';
import type { Channel } from '@/types/playlist.types';
import type { SeriesInfo } from 'expo-m3u-parser';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface SeriesDetailModalProps {
  visible: boolean;
  onClose: () => void;
  series: SeriesInfo | null;
  playlistId: string | null | undefined;
  onEpisodePress: (channel: Channel) => void;
}

export function SeriesDetailModal({
  visible,
  onClose,
  series,
  playlistId,
  onEpisodePress,
}: SeriesDetailModalProps) {
  const [imageError, setImageError] = useState(false);
  const insets = useSafeAreaInsets();
  const tintColor = useThemeColor({}, 'tint');

  useEffect(() => {
    setImageError(false);
  }, [series?.seriesName]);

  const { episodes, isLoading: isLoadingEpisodes } = useSeriesEpisodes(
    visible ? playlistId : null,
    visible ? series?.seriesName : null,
    visible ? series?.groupName : null
  );

  const { metadata, isLoading: isLoadingMetadata } = useSeriesMetadata(
    playlistId,
    series?.seriesName,
    visible
  );

  const seasonMap = useMemo(() => {
    if (!episodes.length) return new Map();
    return groupEpisodesBySeason(episodes);
  }, [episodes]);

  const sortedSeasons = useMemo(
    () => Array.from(seasonMap.keys()).sort((a, b) => a - b),
    [seasonMap]
  );

  // Split groupName by common separators for category pills
  const categories = useMemo(() => {
    if (!series?.groupName) return [];
    return series.groupName
      .split(/\s*[|/]\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
  }, [series?.groupName]);

  if (!series) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <ModalHeader
          title={series.seriesName}
          subtitle={`${series.episodeCount} ${series.episodeCount === 1 ? 'episode' : 'episodes'}`}
          onClose={onClose}
        />

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Poster */}
          {series.poster && !imageError ? (
            <Image
              source={{ uri: series.poster }}
              style={styles.poster}
              resizeMode="contain"
              onError={() => setImageError(true)}
            />
          ) : (
            <ThemedView style={[styles.poster, styles.fallbackPoster]}>
              <ThemedText style={styles.fallbackText}>
                {series.seriesName.charAt(0).toUpperCase()}
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
            isLoading={isLoadingMetadata}
            tintColor={tintColor}
          />

          {/* Loading state */}
          {isLoadingEpisodes && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={tintColor} />
              <ThemedText style={styles.loadingText}>
                Loading episodes...
              </ThemedText>
            </View>
          )}

          {/* Seasons */}
          {!isLoadingEpisodes &&
            sortedSeasons.map((seasonNum) => (
              <SeasonAccordion
                key={seasonNum}
                seasonNumber={seasonNum}
                episodes={seasonMap.get(seasonNum) ?? []}
                onEpisodePress={onEpisodePress}
              />
            ))}

          {/* Empty state */}
          {!isLoadingEpisodes && episodes.length === 0 && (
            <ThemedText style={styles.emptyText}>
              No episodes found
            </ThemedText>
          )}
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
  poster: {
    width: 120,
    height: 160,
    borderRadius: 8,
    alignSelf: 'center',
    marginVertical: 16,
  },
  fallbackPoster: {
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
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
    opacity: 0.7,
  },
  emptyText: {
    textAlign: 'center',
    paddingVertical: 32,
    fontSize: 14,
    opacity: 0.7,
  },
});
