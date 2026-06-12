import ParallaxScrollView from '@/components/ui/containers/parallax-scroll-view';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { DiscoverRow } from '@/features/home/discover-row';
import { useRandomContent } from '@/features/home/hooks/use-random-content';
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

export default function HomeScreen() {
  const router = useRouter();
  const { activePlaylist } = usePlaylistData();
  const playlistId = activePlaylist?.id;
  const excludeAdult = useUserStore((s) => s.currentUser?.settings?.parentalControlEnabled ?? true);
  const isPlaylistInitialized = usePlaylistStore((s) => s.isInitialized);
  const customHeader = useHeaderBackground('home');
  const headerSource = customHeader ?? DEFAULT_HOME_HEADER;

  // Data hooks
  const { items: recentlyWatched, refresh: refreshRecentlyWatched } = useRecentlyWatched(20);
  const { movies, series, isLoading: isContentLoading, refresh: refreshContent } = useRandomContent(30);

  // Ready when playlists are initialized AND either content finished loading or there's no playlist
  const isReady = isPlaylistInitialized && (!playlistId || !isContentLoading);

  // Reveal the UI (fade out the animated splash) once ready. markReady is
  // idempotent, so no guard is needed.
  useEffect(() => {
    if (isReady) {
      useAppReadyStore.getState().markReady();
    }
  }, [isReady]);

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

  // Pull-to-refresh
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.allSettled([refreshRecentlyWatched(), refreshContent()]);
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshRecentlyWatched, refreshContent]);

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
  if (!isReady) {
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
        refreshing={isRefreshing}
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
            title="Discover Movies"
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
            title="Discover Series"
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
