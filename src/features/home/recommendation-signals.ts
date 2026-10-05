/**
 * Translation of the app's per-user state into the recommendation engine's
 * signal payload (see docs/recommendations.md).
 *
 * Reactions and favorites share one keyspace: a plain channel id means a movie,
 * a `series:`-prefixed id means a series name.
 */
import { SERIES_ID_PREFIX } from '@/lib/channel-utils';
import type { ContentReactionValue } from '@/types/user.types';
import type { RecommendationSignals } from 'expo-m3u-parser';

interface ContentRef {
  id: string;
  kind: 'movie' | 'series';
}

export interface RecommendationSignalInput {
  /** The user store's `contentReactions`: id → like (1) / dislike (-1) */
  reactions: Record<string, ContentReactionValue>;
  /** The user store's `favoriteChannels` */
  favoriteIds: string[];
  /** Watched channel ids for the active playlist */
  seenChannelIds: string[];
  /** Watched series names for the active playlist */
  seenSeriesNames: string[];
  /** Movie channel ids watched to completion */
  completedChannelIds: string[];
  /** Series name → number of distinct episodes watched to completion */
  completedEpisodesBySeries: Record<string, number>;
}

/**
 * Completed episodes a series needs before it counts as watched: finishing this
 * many episodes is treated as a signal that the user likes the series, where a
 * single finished episode is not.
 */
export const MIN_COMPLETED_EPISODES = 3;

/**
 * Watched signals needed to personalize for a user who has expressed no
 * explicit taste. Mirrors the engine's own tier threshold.
 */
export const MIN_WATCHED_FOR_TASTE = 4;

/** Which recommendation the engine will answer with, i.e. how to title the row. */
export type RecommendationMode = 'personalized' | 'popular' | 'random';

/** Split a favorite/reaction key into the id and content kind the engine expects. */
function toContentRef(key: string): ContentRef {
  return key.startsWith(SERIES_ID_PREFIX)
    ? { id: key.slice(SERIES_ID_PREFIX.length), kind: 'series' }
    : { id: key, kind: 'movie' };
}

/**
 * Build the signal payload for one generation.
 *
 * Reaction values are already the signed weights the engine wants (like = +1,
 * dislike = −1); favorites carry no weight because the engine applies its own,
 * weaker one. Favorites of live channels are passed through as movies — the
 * engine resolves signal ids against movie rows only, so they drop out there
 * instead of needing a metadata lookup here.
 *
 * Watched signals are implicit and unweighted: the engine applies its own
 * weight and ignores an id that already carries a reaction or a favorite, so
 * they are emitted without de-duplication against those.
 *
 * Shown-id rotation is engine state, so it is deliberately absent.
 */
export function buildRecommendationSignals({
  reactions,
  favoriteIds,
  seenChannelIds,
  seenSeriesNames,
  completedChannelIds,
  completedEpisodesBySeries,
}: RecommendationSignalInput): RecommendationSignals {
  const watchedSeries = Object.entries(completedEpisodesBySeries)
    .filter(([, episodeCount]) => episodeCount >= MIN_COMPLETED_EPISODES)
    .map(([seriesName]): ContentRef => ({ id: seriesName, kind: 'series' }));

  return {
    reactions: Object.entries(reactions).map(([key, value]) => ({
      ...toContentRef(key),
      weight: value,
    })),
    favorites: favoriteIds.map(toContentRef),
    watched: [
      ...completedChannelIds.map((id): ContentRef => ({ id, kind: 'movie' })),
      ...watchedSeries,
    ],
    seenChannelIds,
    seenSeriesNames,
  };
}

/**
 * Which recommendation these signals will produce, so the home page can title
 * its rows for what they actually are.
 *
 * Mirrors the engine's tier rule: an explicit signal (reaction or favorite)
 * personalizes on its own, enough implicit watched signals personalize with a
 * conservative mix, and anything less falls back to crowd favorites. Without a
 * model the engine can only answer randomly.
 *
 * The rule is mirrored, not shared: the engine drops a signal whose id resolves
 * to no movie or series row (a favorited live channel, say), so its tier can be
 * lower than this one. Accepted — the disagreement only affects the row title.
 */
export function recommendationMode(
  signals: RecommendationSignals,
  isModelLoaded: boolean
): RecommendationMode {
  if (!isModelLoaded) return 'random';

  const explicitCount = (signals.reactions?.length ?? 0) + (signals.favorites?.length ?? 0);
  const isPersonalized =
    explicitCount > 0 || (signals.watched?.length ?? 0) >= MIN_WATCHED_FOR_TASTE;

  return isPersonalized ? 'personalized' : 'popular';
}
