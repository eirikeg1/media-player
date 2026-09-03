import ParallaxScrollView from '@/components/ui/containers/parallax-scroll-view';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { DiscoverRow } from '@/features/home/discover-row';
import { usePersonalizedContent } from '@/features/home/hooks/use-personalized-content';
import type { RecommendationMode } from '@/features/home/recommendation-signals';
import { useRecentlyWatched } from '@/features/home/hooks/use-recently-watched';
import { RecentlyWatchedCarousel } from '@/features/home/recently-watched-carousel';
import { usePlaylistData } from '@/features/live/hooks/use-playlist-data';
import { MovieItem } from '@/features/videos/movie-item';
import { MovieDetailModal } from '@/features/videos/movie-detail-modal';
import { SeriesItem } from '@/features/videos/series-item';
import { SeriesDetailModal } from '@/features/videos/series-detail-modal';
import { RustChannelService } from '@/services/rust-channel-service';

import { HomeSkeletonContent } from '@/features/home/home-skeleton-content';
import { useAppReadyStore } from '@/stores/app';
import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import { useUserStore } from '@/stores/user/user-store';
import { useHeaderBackground } from '@/hooks/use-header-background';
import type { Channel } from '@/types/playlist.types';
import type { RecentlyWatchedItem } from '@/types/user.types';
import { Image } from 'expo-image';
import type { SeriesInfo } from 'expo-m3u-parser';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { getChannelId } from '@/lib/channel-utils';

const DEFAULT_HOME_HEADER = require('../../../assets/images/parallax-headers/general/blue-minimalist-wavy.jpg');

// A row title must not promise more than the engine delivered for this batch.
const MOVIE_ROW_TITLES: Record<RecommendationMode, string> = {
  personalized: 'For You',
  popular: 'Popular Movies',
  random: 'Discover Movies',
};

const SERIES_ROW_TITLES: Record<RecommendationMode, string> = {
  personalized: 'Series For You',
  popular: 'Popular Series',
  random: 'Discover Series',
};

export default function HomeScreen() {
  const router = useRouter();
  const { activePlaylist } = usePlaylistData();
  const playlistId = activePlaylist?.id;
  const excludeAdult = useUserStore((s) => s.currentUser?.settings?.parentalControlEnabled ?? true);
  const isPlaylistInitialized = usePlaylistStore((s) => s.isInitialized);
  const customHeader = useHeaderBackground('home');
  const headerSource = customHeader ?? DEFAULT_HOME_HEADER;

  // Data hooks
  const { items: recentlyWatched, isLoading: isRecentlyWatchedLoading, refresh: refreshRecentlyWatched } = useRecentlyWatched(20);
  const {
    movies,
    series,
    mode: recommendationMode,
    isLoading: isContentLoading,
    refresh: refreshContent,
  } = usePersonalizedContent(30);

  // The first load is complete once playlists are initialized AND — when there
  // is an active playlist — BOTH the discover content and the recently-watched
  // ("continue watching") data have finished loading. Waiting on both is what
  // makes them appear together: recently-watched is slower (its per-item channel
  // and per-series poster lookups run in extra round-trips), so gating only on
  // discover let it pop in seconds after the rest of the page.
  const isInitialLoadComplete =
    isPlaylistInitialized && (!playlistId || (!isContentLoading && !isRecentlyWatchedLoading));

  // Latch the first reveal so the animated splash fades out exactly once, when
  // everything is ready. Later background refreshes (tab focus, recently-watched
  // version bumps) flip the loading flags back to true, but must not re-trigger
  // the splash or blank the page — only an explicit pull-to-refresh does that.
  const [isRevealed, setIsRevealed] = useState(false);
  useEffect(() => {
    if (isInitialLoadComplete) {
      setIsRevealed(true);
    }
  }, [isInitialLoadComplete]);

  // Reveal the UI (fade out the animated splash) once ready. markReady is
  // idempotent, so no guard is needed.
  useEffect(() => {
    if (isRevealed) {
      useAppReadyStore.getState().markReady();
    }
  }, [isRevealed]);

  // Safety timeout: reveal the UI after 10s no matter what
  useEffect(() => {
    const timeout = setTimeout(() => {
      useAppReadyStore.getState().markReady();
    }, 10_000);
    return () => clearTimeout(timeout);
  }, []);

  // Auto-refresh recently watched when tab gains focus
  const isInitialMount = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (isInitialMount.current) {
        isInitialMount.current = false;
        return;
      }
      refreshRecentlyWatched();
    }, [refreshRecentlyWatched])
  );

  // Pull-to-refresh reloads both data sources. While it runs we show the loading
  // skeleton (not just the inline spinner) until BOTH finish, so the whole page
  // reappears at once instead of piecemeal.
  const [isFullRefreshing, setIsFullRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setIsFullRefreshing(true);
    try {
      await Promise.allSettled([refreshRecentlyWatched(), refreshContent()]);
    } finally {
      setIsFullRefreshing(false);
    }
  }, [refreshRecentlyWatched, refreshContent]);

  // Show the loading skeleton during the initial load and during a full
  // pull-to-refresh. Background refreshes update the carousels in place.
  const showSkeleton = !isRevealed || isFullRefreshing;

  // Movie detail modal
  const [selectedMovie, setSelectedMovie] = useState<Channel | null>(null);
  const [movieModalVisible, setMovieModalVisible] = useState(false);

  // Series detail modal
  const [selectedSeries, setSelectedSeries] = useState<SeriesInfo | null>(null);
  const [seriesModalVisible, setSeriesModalVisible] = useState(false);

  // Navigation to video player
  const navigateToPlayer = useCallback(
    (channel: Channel, contentType: 'movie' | 'series') => {
      router.push({
        pathname: '/video-player',
        params: {
          channelId: getChannelId(channel),
          playlistId: playlistId ?? '',
          contentType,
        },
      });
    },
    [router, playlistId],
  );

  // Recently watched item press
  const handleRecentlyWatchedPress = useCallback(
    async (item: RecentlyWatchedItem) => {
      if (!playlistId) return;

      if (item.contentType === 'series') {
        const seriesName = item.seriesName;
        if (seriesName) {
          try {
            const result = await RustChannelService.getSeriesList(playlistId, {
              search: seriesName,
              limit: 1,
              excludeAdult,
            });
            if (result.series.length > 0) {
              setSelectedSeries(result.series[0]);
              setSeriesModalVisible(true);
              return;
            }
          } catch (error) {
            console.error('[HomeScreen] Error looking up series:', error);
          }
        }
      }

      // Movie or fallback: open movie detail modal
      if (item.contentType === 'movie') {
        try {
          const channel = await RustChannelService.getChannelById(playlistId, item.channelId);
          if (channel) {
            setSelectedMovie(channel);
            setMovieModalVisible(true);
            return;
          }
        } catch (error) {
          console.error('[HomeScreen] Error looking up movie:', error);
        }
      }
    },
    [playlistId, excludeAdult],
  );

  // Discover movie press
  const handleMoviePress = useCallback((channel: Channel) => {
    setSelectedMovie(channel);
    setMovieModalVisible(true);
  }, []);

  const handleMovieModalClose = useCallback(() => {
    setMovieModalVisible(false);
  }, []);

  const handleMoviePlay = useCallback(
    (channel: Channel) => {
      setMovieModalVisible(false);
      navigateToPlayer(channel, 'movie');
    },
    [navigateToPlayer],
  );

  // Discover series press
  const handleSeriesPress = useCallback((s: SeriesInfo) => {
    setSelectedSeries(s);
    setSeriesModalVisible(true);
  }, []);

  const handleSeriesModalClose = useCallback(() => {
    setSeriesModalVisible(false);
  }, []);

  const handleEpisodePress = useCallback(
    (channel: Channel) => {
      setSeriesModalVisible(false);
      navigateToPlayer(channel, 'series');
    },
    [navigateToPlayer],
  );

  // Skeleton content behind splash screen — if splash hides before content loads, users see loading UI
  if (showSkeleton) {
    return (
      <ParallaxScrollView
        headerBackgroundColor={{ light: '#2D2D2D', dark: '#1A1A1A' }}
        padding={0}
        showsVerticalScrollIndicator={false}
        headerImage={
          <View style={styles.headerContainer}>
            <Image
              source={headerSource}
              style={styles.headerBackground}
              contentFit="cover"
            />
          </View>
        }
      >
        <HomeSkeletonContent />
      </ParallaxScrollView>
    );
  }

  // No active playlist state
  if (!playlistId) {
    return (
      <ThemedView style={styles.emptyContainer}>
        <ThemedText type="subtitle">No Active Playlist</ThemedText>
        <ThemedText style={styles.emptyText}>
          Select a playlist from settings to get started.
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <>
      <ParallaxScrollView
        headerBackgroundColor={{ light: '#2D2D2D', dark: '#1A1A1A' }}
        padding={0}
        showsVerticalScrollIndicator={false}
        refreshing={isFullRefreshing}
        onRefresh={handleRefresh}
        headerImage={
          <View style={styles.headerContainer}>
            <Image
              source={headerSource}
              style={styles.headerBackground}
              contentFit="cover"
            />
          </View>
        }
      >
        <View style={styles.content}>
          {recentlyWatched.length > 0 && (
            <RecentlyWatchedCarousel
              items={recentlyWatched}
              onItemPress={handleRecentlyWatchedPress}
            />
          )}

          <DiscoverRow
            title={MOVIE_ROW_TITLES[recommendationMode]}
            data={movies}
            keyExtractor={(channel) => getChannelId(channel)}
            renderItem={(channel) => (
              <MovieItem
                channel={channel}
                isFavorite={false}
                onPress={handleMoviePress}
              />
            )}
          />

          <DiscoverRow
            title={SERIES_ROW_TITLES[recommendationMode]}
            data={series}
            keyExtractor={(s) => s.seriesName}
            renderItem={(s) => (
              <SeriesItem
                series={s}
                isFavorite={false}
                onPress={handleSeriesPress}
              />
            )}
          />
        </View>
      </ParallaxScrollView>

      <MovieDetailModal
        visible={movieModalVisible}
        onClose={handleMovieModalClose}
        movie={selectedMovie}
        playlistId={playlistId}
        onPlayPress={handleMoviePlay}
      />

      <SeriesDetailModal
        visible={seriesModalVisible}
        onClose={handleSeriesModalClose}
        series={selectedSeries}
        playlistId={playlistId}
        onEpisodePress={handleEpisodePress}
      />
    </>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    width: '100%',
    height: '100%',
  },
  headerBackground: {
    width: '100%',
    height: '100%',
  },
  content: {
    gap: 24,
    paddingVertical: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    padding: 24,
  },
  emptyText: {
    opacity: 0.6,
    textAlign: 'center',
  },
});
