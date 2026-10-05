import { ModalHeader } from '@/components/ui/containers/modal/modal-header';
import { Button } from '@/components/ui/controls/button';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { FavoriteStar } from '@/features/live/favorite-star';
import { CategoryPill } from '@/features/videos/category-pill';
import { MetadataSection } from '@/features/videos/components/metadata-section';
import { useMovieMetadata } from '@/features/videos/hooks/use-movie-metadata';
import { ReactionButtons } from '@/features/videos/reaction-buttons';
import { useChromeInsets } from '@/hooks/use-chrome-insets';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getChannelId } from '@/lib/channel-utils';
import { movieHref } from '@/lib/detail-hrefs';
import { hrefParam } from '@/lib/route-params';
import { usePlaybackQueueStore } from '@/stores/video/queue-store';
import type { Channel } from '@/types/playlist.types';
import { Image, type ImageLoadEventData } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Portrait poster ratio, used until the real image reports its own. */
const DEFAULT_POSTER_ASPECT = 2 / 3;

interface MovieDetailProps {
  movie: Channel;
  playlistId: string;
  /** Leave the detail surface — the route supplies `router.back()`. */
  onClose: () => void;
}

/**
 * Everything a movie's detail surface shows. Rendered by `/(detail)/movie`,
 * which owns the presentation; this component owns the content and the step
 * that follows it, pushing the player itself so that backing out of playback
 * returns here rather than to the grid.
 */
export function MovieDetail({ movie, playlistId, onClose }: MovieDetailProps) {
  const router = useRouter();
  const [failedPosterUrl, setFailedPosterUrl] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState(DEFAULT_POSTER_ASPECT);
  const insets = useSafeAreaInsets();
  const chromeInsets = useChromeInsets();
  const tintColor = useThemeColor({}, 'tint');

  const channelId = getChannelId(movie);
  const { metadata, isLoading } = useMovieMetadata(playlistId, channelId, true);

  const posterUrl = movie.tvg.logo || metadata?.backdropPath;
  const showPoster = !!posterUrl && failedPosterUrl !== posterUrl;

  // The poster's own ratio arrives with the decoded image, so it costs no extra
  // request — `Image.getSize` fetched the file a second time, with no failure
  // handler and nothing to cancel it when the surface closed.
  const handlePosterLoad = useCallback((event: ImageLoadEventData) => {
    const { width, height } = event.source;
    if (width > 0 && height > 0) setAspectRatio(width / height);
  }, []);

  // The URL changes at most once per movie, when metadata supplies a backdrop
  // for a movie with no logo of its own.
  useEffect(() => {
    setAspectRatio(DEFAULT_POSTER_ASPECT);
  }, [posterUrl]);

  // Split groupName by common separators for category pills
  const categories = useMemo(() => {
    if (!movie.group.title) return [];
    return movie.group.title
      .split(/\s*(?:\||\/)\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
  }, [movie.group.title]);

  const handlePlay = useCallback(() => {
    // A movie is a session of one: whatever queue a series left staged must not
    // follow it into the player as a "next episode".
    usePlaybackQueueStore.getState().reset();
    router.push({
      pathname: '/video-player',
      params: {
        channelId,
        playlistId,
        contentType: 'movie',
        // Remembered by the session, so expanding the mini bar later puts this
        // surface back underneath the player.
        origin: hrefParam.encode(movieHref(playlistId, movie)),
      },
    });
  }, [router, channelId, playlistId, movie]);

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <ModalHeader
        title={movie.name}
        subtitle={movie.group.title}
        onClose={onClose}
        headerRight={
          <FavoriteStar channelId={channelId} channelName={movie.name} size={22} />
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

        {/* Like/dislike reactions */}
        <ReactionButtons channelId={channelId} contentName={movie.name} />

        {/* Metadata */}
        <MetadataSection metadata={metadata} isLoading={isLoading} tintColor={tintColor} />

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
