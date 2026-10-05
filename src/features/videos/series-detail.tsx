import { ModalHeader } from '@/components/ui/containers/modal/modal-header';
import { Button } from '@/components/ui/controls/button';
import { Spinner } from '@/components/ui/display/state';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { FavoriteStar } from '@/features/live/favorite-star';
import { CategoryPill } from '@/features/videos/category-pill';
import { MetadataSection } from '@/features/videos/components/metadata-section';
import { useSeriesContinueEpisode } from '@/features/videos/hooks/use-series-continue-episode';
import { useSeriesEpisodes } from '@/features/videos/hooks/use-series-episodes';
import { useSeriesMetadata } from '@/features/videos/hooks/use-series-metadata';
import { ReactionButtons } from '@/features/videos/reaction-buttons';
import { SeasonAccordion } from '@/features/videos/season-accordion';
import { useChromeInsets } from '@/hooks/use-chrome-insets';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getChannelId, getSeriesId } from '@/lib/channel-utils';
import { seriesHref } from '@/lib/detail-hrefs';
import { hrefParam } from '@/lib/route-params';
import { groupEpisodesBySeason } from '@/lib/series-utils';
import { usePlaybackQueueStore } from '@/stores/video/queue-store';
import type { Channel } from '@/types/playlist.types';
import { Image, type ImageLoadEventData } from 'expo-image';
import type { SeriesInfo } from 'expo-m3u-parser';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Portrait poster ratio, used until the real image reports its own. */
const DEFAULT_POSTER_ASPECT = 2 / 3;

interface SeriesDetailProps {
  series: SeriesInfo;
  playlistId: string;
  /** Leave the detail surface — the route supplies `router.back()`. */
  onClose: () => void;
}

/**
 * Everything a series' detail surface shows. Rendered by `/(detail)/series`,
 * which owns the presentation; this component owns the content and the step
 * that follows it, staging the playback queue and pushing the player itself so
 * that backing out of an episode returns to the season list.
 */
export function SeriesDetail({ series, playlistId, onClose }: SeriesDetailProps) {
  const router = useRouter();
  const [failedPosterUrl, setFailedPosterUrl] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState(DEFAULT_POSTER_ASPECT);
  const insets = useSafeAreaInsets();
  const chromeInsets = useChromeInsets();
  const tintColor = useThemeColor({}, 'tint');

  const { episodes, isLoading: isLoadingEpisodes } = useSeriesEpisodes(
    playlistId,
    series.seriesName,
    series.groupName
  );

  const { metadata, isLoading: isLoadingMetadata } = useSeriesMetadata(
    playlistId,
    series.seriesName,
    true
  );

  const { continueEpisode } = useSeriesContinueEpisode(playlistId, episodes);

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

  const handleEpisodePress = useCallback(
    (channel: Channel) => {
      const channelId = getChannelId(channel);
      const currentIndex = flatEpisodes.findIndex((ch) => getChannelId(ch) === channelId);
      // Hand the season's episodes to the session about to start, so
      // next/previous plays through them.
      usePlaybackQueueStore
        .getState()
        .stageQueue(channelId, flatEpisodes, currentIndex >= 0 ? currentIndex : 0);
      router.push({
        pathname: '/video-player',
        params: {
          channelId,
          playlistId,
          contentType: 'series',
          // Remembered by the session, so expanding the mini bar later puts this
          // surface back underneath the player.
          origin: hrefParam.encode(seriesHref(playlistId, series)),
        },
      });
    },
    [router, flatEpisodes, playlistId, series]
  );

  const posterUrl = series.poster || metadata?.backdropPath;
  const showPoster = !!posterUrl && failedPosterUrl !== posterUrl;

  // The poster's own ratio arrives with the decoded image, so it costs no extra
  // request — `Image.getSize` fetched the file a second time, with no failure
  // handler and nothing to cancel it when the surface closed.
  const handlePosterLoad = useCallback((event: ImageLoadEventData) => {
    const { width, height } = event.source;
    if (width > 0 && height > 0) setAspectRatio(width / height);
  }, []);

  // The URL changes at most once per series, when metadata supplies a backdrop
  // for a series with no poster of its own.
  useEffect(() => {
    setAspectRatio(DEFAULT_POSTER_ASPECT);
  }, [posterUrl]);

  // Split groupName by common separators for category pills
  const categories = useMemo(() => {
    if (!series.groupName) return [];
    return series.groupName
      .split(/\s*(?:\||\/)\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
  }, [series.groupName]);

  return (
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
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: styles.scrollContent.paddingBottom + chromeInsets.bottom },
        ]}
      >
        {/* Poster */}
        {showPoster ? (
          <Image
            source={{ uri: posterUrl }}
            style={[styles.posterBase, { aspectRatio, maxWidth: '90%' }]}
            contentFit="cover"
            onLoad={handlePosterLoad}
            onError={() => setFailedPosterUrl(posterUrl)}
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

        {/* Like/dislike reactions */}
        <ReactionButtons
          channelId={getSeriesId(series)}
          contentName={series.seriesName}
        />

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
                onPress={() => handleEpisodePress(continueEpisode.channel)}
              />
            ) : firstEpisode ? (
              <Button
                title={`Play from Beginning · S${firstEpisode.season} E${firstEpisode.episode}`}
                icon="play.fill"
                variant="secondary"
                size="large"
                fullWidth
                onPress={() => handleEpisodePress(firstEpisode.channel)}
              />
            ) : null}
          </View>
        )}

        {/* Loading state */}
        {isLoadingEpisodes && (
          <View style={styles.loadingContainer}>
            <Spinner />
            <ThemedText style={styles.loadingText}>Loading episodes...</ThemedText>
          </View>
        )}

        {/* Seasons */}
        {!isLoadingEpisodes &&
          sortedSeasons.map((seasonNum) => (
            <SeasonAccordion
              key={seasonNum}
              seasonNumber={seasonNum}
              episodes={seasonMap.get(seasonNum) ?? []}
              onEpisodePress={handleEpisodePress}
            />
          ))}

        {/* Empty state */}
        {!isLoadingEpisodes && episodes.length === 0 && (
          <ThemedText style={styles.emptyText}>No episodes found</ThemedText>
        )}
      </ScrollView>
    </ThemedView>
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
