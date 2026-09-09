import type { RecommendationMode } from '@/features/home/recommendation-signals';
import { buildRecommendationSignals, recommendationMode } from '@/features/home/recommendation-signals';
import { getChannelId } from '@/lib/channel-utils';
import { ensureRecommendationModelLoaded } from '@/services/recommendation-model';
import { RustChannelService } from '@/services/rust-channel-service';
import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import { useUserStore } from '@/stores/user/user-store';
import type { Channel } from '@/types/playlist.types';
import type { SeriesInfo } from 'expo-m3u-parser';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The home page's discover rows, personalized from the user's likes, dislikes,
 * favorites and completed watches (see docs/recommendations.md). `mode` says
 * what the engine actually answered with, so the rows can be titled honestly.
 *
 * Reads serve the batch a previous run precomputed — only the very first one
 * generates synchronously, behind the splash screen — and every read
 * fire-and-forgets the generation of the batch the *next* read will serve.
 *
 * Taste signals are read imperatively rather than subscribed to on purpose: a
 * like landing while the home page is mounted must not swap the rows out from
 * under the user. The new signal is picked up by the next generation, i.e. on
 * pull-to-refresh or the next launch.
 */
export function usePersonalizedContent(limit = 50) {
  const userId = useUserStore((s) => s.currentUser?.id);
  const activePlaylistId = usePlaylistStore((s) => s.activePlaylistId);
  const excludeAdult = useUserStore((s) => s.currentUser?.settings?.parentalControlEnabled ?? true);

  const [movies, setMovies] = useState<Channel[]>([]);
  const [series, setSeries] = useState<SeriesInfo[]>([]);
  const [mode, setMode] = useState<RecommendationMode>('random');
  const [isLoading, setIsLoading] = useState(true);

  // Every fetch takes the next generation; only the newest one may write state,
  // so an unmount or a superseding refresh discards the in-flight run's result.
  const generationRef = useRef(0);

  /** Supersede whatever run is in flight, so its result is discarded. */
  const cancelInFlightFetch = useCallback(() => {
    generationRef.current += 1;
  }, []);

  const fetch = useCallback(async () => {
    const generation = ++generationRef.current;
    const isCurrent = () => generationRef.current === generation;

    if (!userId || !activePlaylistId) {
      setMovies([]);
      setSeries([]);
      setMode('random');
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);

      // Wait for the taste model: without it the engine would silently answer
      // with random picks, and the first batch is the one users see longest.
      const isModelLoaded = await ensureRecommendationModelLoaded();

      const { contentReactions, favoriteChannels, getWatchedContent } = useUserStore.getState();
      const watched = await getWatchedContent(userId, activePlaylistId);
      const signals = buildRecommendationSignals({
        reactions: contentReactions,
        favoriteIds: favoriteChannels,
        seenChannelIds: watched.channelIds,
        seenSeriesNames: watched.seriesNames,
        completedChannelIds: watched.completedChannelIds,
        completedEpisodesBySeries: watched.completedEpisodesBySeries,
      });

      const [movieResults, seriesResults] = await Promise.all([
        RustChannelService.getPersonalizedMovieRecommendations(
          activePlaylistId, userId, excludeAdult, limit, signals
        ),
        RustChannelService.getPersonalizedSeriesRecommendations(
          activePlaylistId, userId, excludeAdult, limit, signals
        ),
      ]);

      // Deduplicate
      const uniqueMovies = movieResults.filter(
        (c, i, arr) => arr.findIndex((x) => getChannelId(x) === getChannelId(c)) === i
      );
      const uniqueSeries = seriesResults.filter(
        (s, i, arr) => arr.findIndex((x) => x.seriesName === s.seriesName) === i
      );

      if (isCurrent()) {
        setMovies(uniqueMovies);
        setSeries(uniqueSeries);
        setMode(recommendationMode(signals, isModelLoaded));
      }

      // Fire-and-forget: precompute the batch the next read will serve
      RustChannelService.regeneratePersonalizedMovieRecommendations(
        activePlaylistId, userId, excludeAdult, limit, signals
      ).catch(() => {});
      RustChannelService.regeneratePersonalizedSeriesRecommendations(
        activePlaylistId, userId, excludeAdult, limit, signals
      ).catch(() => {});
    } catch (error) {
      if (!isCurrent()) return;
      console.error('[usePersonalizedContent] Error:', error);
      setMovies([]);
      setSeries([]);
      setMode('random');
    } finally {
      if (isCurrent()) {
        setIsLoading(false);
      }
    }
  }, [userId, activePlaylistId, limit, excludeAdult]);

  useEffect(() => {
    fetch();
    return cancelInFlightFetch;
  }, [fetch, cancelInFlightFetch]);

  return { movies, series, mode, isLoading, refresh: fetch };
}
