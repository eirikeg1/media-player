import { Button } from '@/components/ui/controls/button';
import { ModalHeader } from '@/components/ui/containers/modal/modal-header';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { CategoryPill } from '@/features/videos/category-pill';
import { MetadataSection } from '@/features/videos/components/metadata-section';
import { FavoriteStar } from '@/features/live/favorite-star';
import { SeasonAccordion } from '@/features/videos/season-accordion';
import { useSeriesContinueEpisode } from '@/features/videos/hooks/use-series-continue-episode';
import { useSeriesEpisodes } from '@/features/videos/hooks/use-series-episodes';
import { useSeriesMetadata } from '@/features/videos/hooks/use-series-metadata';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getChannelId, getSeriesId } from '@/lib/channel-utils';
import { groupEpisodesBySeason } from '@/lib/series-utils';
import { usePlaybackQueueStore } from '@/stores/video/queue-store';
import type { Channel } from '@/types/playlist.types';
import type { SeriesInfo } from 'expo-m3u-parser';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  const [aspectRatio, setAspectRatio] = useState(2 / 3);
  const insets = useSafeAreaInsets();
  const tintColor = useThemeColor({}, 'tint');

  useEffect(() => {
    setImageError(false);
    setAspectRatio(2 / 3);
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

  const { continueEpisode } = useSeriesContinueEpisode(
    visible ? playlistId : null,
    episodes
  );

  const seasonMap = useMemo(() => {
    if (!episodes.length) return new Map();
    return groupEpisodesBySeason(episodes);
  }, [episodes]);

  const sortedSeasons = useMemo(
    () => Array.from(seasonMap.keys()).sort((a, b) => a - b),
    [seasonMap]
  );

  const firstEpisode = useMemo(() => {
    const firstSeason = sortedSeasons[0];
    if (firstSeason == null) return null;
    return seasonMap.get(firstSeason)?.[0] ?? null;
  }, [sortedSeasons, seasonMap]);

  // Flat episode list ordered by season then episode for playback queue
  const flatEpisodes = useMemo(() => {
    const result: Channel[] = [];
    for (const seasonNum of sortedSeasons) {
      const eps = seasonMap.get(seasonNum) ?? [];
      for (const ep of eps) {
        result.push(ep.channel);
      }
    }
    return result;
  }, [sortedSeasons, seasonMap]);

  const handleEpisodePressWithQueue = useCallback((channel: Channel) => {
    const queueItems = flatEpisodes.map(ch => ({
      channelId: getChannelId(ch),
      channel: ch,
    }));
    const currentIndex = queueItems.findIndex(
      item => item.channelId === getChannelId(channel)
    );
    usePlaybackQueueStore.getState().setQueue(
      queueItems,
      currentIndex >= 0 ? currentIndex : 0
    );
    onEpisodePress(channel);
  }, [flatEpisodes, onEpisodePress]);

  const posterUrl = series?.poster || metadata?.backdropPath;

  useEffect(() => {
    if (posterUrl) {
      Image.getSize(posterUrl, (w, h) => setAspectRatio(w / h));
    }
  }, [posterUrl]);

  // Split groupName by common separators for category pills
  const categories = useMemo(() => {
    if (!series?.groupName) return [];
    return series.groupName
      .split(/\s*(?:\||\/)\s*/)
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
          headerRight={
            <FavoriteStar
              channelId={getSeriesId(series)}
              channelName={series.seriesName}
              size={22}
            />
          }
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

          {/* Continue watching / Play from Beginning button */}
          {!isLoadingEpisodes && (continueEpisode || firstEpisode) && (
            <View style={styles.continueButtonContainer}>
              {continueEpisode ? (
                <Button
                  title={`Continue S${continueEpisode.season}-E${continueEpisode.episode}`}
                  icon="play.fill"
                  variant="primary"
                  size="large"
                  fullWidth
                  onPress={() => handleEpisodePressWithQueue(continueEpisode.channel)}
                />
              ) : firstEpisode ? (
                <Button
                  title={`Play from Beginning · S${firstEpisode.season} E${firstEpisode.episode}`}
                  icon="play.fill"
                  variant="secondary"
                  size="large"
                  fullWidth
                  onPress={() => handleEpisodePressWithQueue(firstEpisode.channel)}
                />
              ) : null}
            </View>
          )}

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
                onEpisodePress={handleEpisodePressWithQueue}
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
  continueButtonContainer: {
    paddingHorizontal: 16,
    marginTop: 24,
    marginBottom: 16,
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
