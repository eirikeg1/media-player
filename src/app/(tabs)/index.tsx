import ParallaxScrollView from '@/components/ui/containers/parallax-scroll-view';
import { EmptyState } from '@/components/ui/display/state';
import { DiscoverRow } from '@/features/home/discover-row';
import { usePersonalizedContent } from '@/features/home/hooks/use-personalized-content';
import type { RecommendationMode } from '@/features/home/recommendation-signals';
import { useRecentlyWatched } from '@/features/home/hooks/use-recently-watched';
import { RecentlyWatchedCarousel } from '@/features/home/recently-watched-carousel';
import { usePlaylistData } from '@/features/live/hooks/use-playlist-data';
import { MovieItem } from '@/features/videos/movie-item';
import { SeriesItem } from '@/features/videos/series-item';
import { RustChannelService } from '@/services/rust-channel-service';

import { HomeSkeletonContent } from '@/features/home/home-skeleton-content';
import { useReportLandingReady } from '@/features/launch/use-report-landing-ready';
import { HOME_CACHE_SLOT } from '@/stores/cache';
import { selectExcludeAdult, useUserStore } from '@/stores/user/user-store';
import { useHeaderBackground } from '@/hooks/use-header-background';
import type { Channel } from '@/types/playlist.types';
import type { RecentlyWatchedItem } from '@/types/user.types';
import { Image } from 'expo-image';
import type { SeriesInfo } from 'expo-m3u-parser';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { getChannelId } from '@/lib/channel-utils';
import { movieHref, seriesHref } from '@/lib/detail-hrefs';

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

/** Module-level so the discover rows keep the same key function across renders. */
const seriesRowKey = (series: SeriesInfo) => series.seriesName;

export default function HomeScreen() {
  const router = useRouter();
  const { activePlaylist, hasLoadedPlaylist } = usePlaylistData();
  const playlistId = activePlaylist?.id;
  const excludeAdult = useUserStore((s) => selectExcludeAdult(s.currentUser));
  const customHeader = useHeaderBackground('home');
  const headerSource = customHeader ?? DEFAULT_HOME_HEADER;

  // Data hooks. The row counts come from the cache slot's declaration, so what
  // the launch pre-fetch filled is exactly what these ask for — a different
  // count would read as a miss and load the page all over again.
  const { items: recentlyWatched, isLoading: isRecentlyWatchedLoading, refresh: refreshRecentlyWatched } =
    useRecentlyWatched(HOME_CACHE_SLOT.recentlyWatchedLimit);
  const {
    movies,
    series,
    mode: recommendationMode,
    isLoading: isContentLoading,
    refresh: refreshContent,
  } = usePersonalizedContent(HOME_CACHE_SLOT.contentLimit);

  // The first load is complete once playlists are initialized AND — when there
  // is an active playlist — BOTH the discover content and the recently-watched
  // ("continue watching") data have finished loading. Waiting on both is what
  // makes them appear together: recently-watched is slower (its per-item channel
  // and per-series poster lookups run in extra round-trips), so gating only on
  // discover let it pop in seconds after the rest of the page.
  const isInitialLoadComplete =
    hasLoadedPlaylist && (!playlistId || (!isContentLoading && !isRecentlyWatchedLoading));

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

  // Hold the loading screen until the page is populated, when Home is the tab
  // the launch lands on. With the pre-fetched slices in hand this is true on
  // the first render, so the splash is not waiting on anything.
  useReportLandingReady('home', isRevealed);

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

  // Opening a title is a navigation, not screen state: the detail route keeps
  // this page mounted behind it and stays in history, so the player it launches
  // comes back to the title rather than to the home page.
  const openMovie = useCallback(
    (channel: Channel) => {
      router.push(movieHref(playlistId ?? '', channel));
    },
    [router, playlistId],
  );

  const openSeries = useCallback(
    (series: SeriesInfo) => {
      router.push(seriesHref(playlistId ?? '', series));
    },
    [router, playlistId],
  );

  // Recently watched item press
  const handleRecentlyWatchedPress = useCallback(
    async (item: RecentlyWatchedItem) => {
      if (!playlistId) return;

      const title = item.seriesName ?? item.channelName;
      try {
        if (item.contentType === 'series' && item.seriesName) {
          // By exact name, not a fuzzy search: `limit: 1` over a substring match
          // happily opened a different series whose name merely contained this one.
          const result = await RustChannelService.getSeriesList(playlistId, {
            exactName: item.seriesName,
            limit: 1,
            excludeAdult,
          });
          if (result.series.length > 0) {
            openSeries(result.series[0]);
            return;
          }
        } else if (item.contentType === 'movie') {
          const channel = await RustChannelService.getChannelById(playlistId, item.channelId);
          if (channel) {
            openMovie(channel);
            return;
          }
        }
      } catch (error) {
        console.error('[HomeScreen] Error opening recently watched item:', error);
        Alert.alert('Something Went Wrong', `Couldn't open "${title}". Please try again.`);
        return;
      }

      // A dead tap is worse than a message: the title is in the watch history but
      // no longer in the playlist (removed upstream, or hidden by parental control).
      Alert.alert(
        'No Longer Available',
        `"${title}" isn't in this playlist any more. It may have been removed by your provider.`,
      );
    },
    [playlistId, excludeAdult, openMovie, openSeries],
  );

  // Stable cell renderers: a fresh closure per render would re-render every cell
  // in both rows.
  const renderMovieCell = useCallback(
    (channel: Channel) => (
      <MovieItem channel={channel} isFavorite={false} onPress={openMovie} />
    ),
    [openMovie],
  );

  const renderSeriesCell = useCallback(
    (entry: SeriesInfo) => (
      <SeriesItem series={entry} isFavorite={false} onPress={openSeries} />
    ),
    [openSeries],
  );

  // No active playlist state
  if (!playlistId) {
    return (
      <EmptyState
        icon="film.fill"
        title="No Active Playlist"
        message="Select a playlist from settings to get started."
        safeArea
      />
    );
  }

  return (
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
      {showSkeleton ? (
        // Same scroll view, different children: swapping to a second
        // ParallaxScrollView for the skeleton unmounted the RefreshControl
        // the user was pulling on the moment the refresh started.
        <HomeSkeletonContent />
      ) : (
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
            keyExtractor={getChannelId}
            renderItem={renderMovieCell}
          />

          <DiscoverRow
            title={SERIES_ROW_TITLES[recommendationMode]}
            data={series}
            keyExtractor={seriesRowKey}
            renderItem={renderSeriesCell}
          />
        </View>
      )}
    </ParallaxScrollView>
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
});
