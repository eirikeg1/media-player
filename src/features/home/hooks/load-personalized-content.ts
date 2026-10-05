import { userRepository } from '@/db/user-repository';
import type { RecommendationMode } from '@/features/home/recommendation-signals';
import { buildRecommendationSignals, recommendationMode } from '@/features/home/recommendation-signals';
import { getChannelId } from '@/lib/channel-utils';
import { shareInFlight } from '@/lib/promise-utils';
import { ensureRecommendationModelLoaded } from '@/services/recommendation-model';
import { RustChannelService } from '@/services/rust-channel-service';
import type { Channel } from '@/types/playlist.types';
import type { ContentReactionValue } from '@/types/user.types';
import type { SeriesInfo } from 'expo-m3u-parser';

/** What one batch of discover rows is built from. */
export interface PersonalizedContentQuery {
  playlistId: string;
  userId: string;
  excludeAdult: boolean;
  /** Titles per row. */
  limit: number;
  /** The user's likes and dislikes, as the store holds them. */
  reactions: Record<string, ContentReactionValue>;
  /** The user's favourite channel ids, as the store holds them. */
  favoriteIds: string[];
}

/** One batch of discover rows, and what the engine actually answered with. */
export interface PersonalizedContent {
  movies: Channel[];
  series: SeriesInfo[];
  mode: RecommendationMode;
}

/** Runs in flight, so the launch pre-fetch and the discover rows mounting
 *  behind it share one batch instead of generating two. */
const inFlight = new Map<string, Promise<PersonalizedContent>>();

/** Keep the first entry per key, in one pass rather than a scan per item. */
function dedupeBy<T>(items: T[], keyOf: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyOf(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The home page's discover rows, personalized from the user's likes, dislikes,
 * favorites and completed watches (see docs/recommendations.md). `mode` says
 * what the engine actually answered with, so the rows can be titled honestly.
 *
 * Reads serve the batch a previous run precomputed — only the very first one
 * generates synchronously, behind the splash screen — and every read
 * fire-and-forgets the generation of the batch the *next* read will serve.
 *
 * Framework-free on purpose — the launch pre-fetch fills the cache with it
 * while the loading screen is still up, and `usePersonalizedContent` serves and
 * revalidates that same cache — so the two can never answer differently.
 */
export function loadPersonalizedContent(
  query: PersonalizedContentQuery,
): Promise<PersonalizedContent> {
  const { playlistId, userId, excludeAdult, limit } = query;
  return shareInFlight(
    inFlight,
    `${playlistId}|${userId}|${excludeAdult}|${limit}`,
    () => readPersonalizedContent(query),
  );
}

async function readPersonalizedContent({
  playlistId,
  userId,
  excludeAdult,
  limit,
  reactions,
  favoriteIds,
}: PersonalizedContentQuery): Promise<PersonalizedContent> {
  // Wait for the taste model: without it the engine would silently answer
  // with random picks, and the first batch is the one users see longest.
  const isModelLoaded = await ensureRecommendationModelLoaded();

  const watched = await userRepository.getWatchedContent(userId, playlistId);
  const signals = buildRecommendationSignals({
    reactions,
    favoriteIds,
    seenChannelIds: watched.channelIds,
    seenSeriesNames: watched.seriesNames,
    completedChannelIds: watched.completedChannelIds,
    completedEpisodesBySeries: watched.completedEpisodesBySeries,
  });

  const [movieResults, seriesResults] = await Promise.all([
    RustChannelService.getPersonalizedMovieRecommendations(
      playlistId, userId, excludeAdult, limit, signals
    ),
    RustChannelService.getPersonalizedSeriesRecommendations(
      playlistId, userId, excludeAdult, limit, signals
    ),
  ]);

  // Fire-and-forget: precompute the batch the next read will serve
  RustChannelService.regeneratePersonalizedMovieRecommendations(
    playlistId, userId, excludeAdult, limit, signals
  ).catch(() => {});
  RustChannelService.regeneratePersonalizedSeriesRecommendations(
    playlistId, userId, excludeAdult, limit, signals
  ).catch(() => {});

  return {
    movies: dedupeBy(movieResults, getChannelId),
    series: dedupeBy(seriesResults, (entry) => entry.seriesName),
    mode: recommendationMode(signals, isModelLoaded),
  };
}
