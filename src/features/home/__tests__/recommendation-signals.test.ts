import type { RecommendationSignalInput } from '@/features/home/recommendation-signals';
import {
  buildRecommendationSignals,
  MIN_COMPLETED_EPISODES,
  MIN_WATCHED_FOR_TASTE,
  recommendationMode,
} from '@/features/home/recommendation-signals';

const EMPTY_INPUT: RecommendationSignalInput = {
  reactions: {},
  favoriteIds: [],
  seenChannelIds: [],
  seenSeriesNames: [],
  completedChannelIds: [],
  completedEpisodesBySeries: {},
};

/** Signals carrying `count` watched movies and nothing else. */
function watchedSignals(count: number) {
  return buildRecommendationSignals({
    ...EMPTY_INPUT,
    completedChannelIds: Array.from({ length: count }, (_, i) => `movie-${i}`),
  });
}

describe('buildRecommendationSignals', () => {
  it('maps likes and dislikes to signed weights', () => {
    const signals = buildRecommendationSignals({
      ...EMPTY_INPUT,
      reactions: { 'movie-liked': 1, 'movie-disliked': -1 },
    });

    expect(signals.reactions).toEqual([
      { id: 'movie-liked', kind: 'movie', weight: 1 },
      { id: 'movie-disliked', kind: 'movie', weight: -1 },
    ]);
  });

  it('strips the series prefix and tags the reaction as a series', () => {
    const signals = buildRecommendationSignals({
      ...EMPTY_INPUT,
      reactions: { 'series:Breaking Bad': 1 },
    });

    expect(signals.reactions).toEqual([{ id: 'Breaking Bad', kind: 'series', weight: 1 }]);
  });

  it('applies the same prefix rule to favorites, which carry no weight', () => {
    const signals = buildRecommendationSignals({
      ...EMPTY_INPUT,
      favoriteIds: ['channel-1', 'series:The Wire'],
    });

    expect(signals.favorites).toEqual([
      { id: 'channel-1', kind: 'movie' },
      { id: 'The Wire', kind: 'series' },
    ]);
  });

  it('passes the seen set through untouched', () => {
    const signals = buildRecommendationSignals({
      ...EMPTY_INPUT,
      seenChannelIds: ['watched-1'],
      seenSeriesNames: ['Fargo'],
    });

    expect(signals.seenChannelIds).toEqual(['watched-1']);
    expect(signals.seenSeriesNames).toEqual(['Fargo']);
  });

  it('leaves rotation state to the engine', () => {
    const signals = buildRecommendationSignals(EMPTY_INPUT);

    expect(signals.shownChannelIds).toBeUndefined();
    expect(signals.shownSeriesNames).toBeUndefined();
  });

  it('produces empty collections for a user with no history', () => {
    expect(buildRecommendationSignals(EMPTY_INPUT)).toEqual({
      reactions: [],
      favorites: [],
      watched: [],
      seenChannelIds: [],
      seenSeriesNames: [],
    });
  });

  it('reports every completed movie as watched', () => {
    const signals = buildRecommendationSignals({
      ...EMPTY_INPUT,
      completedChannelIds: ['movie-1', 'movie-2'],
    });

    expect(signals.watched).toEqual([
      { id: 'movie-1', kind: 'movie' },
      { id: 'movie-2', kind: 'movie' },
    ]);
  });

  it('reports a series only once enough episodes are finished', () => {
    const signals = buildRecommendationSignals({
      ...EMPTY_INPUT,
      completedEpisodesBySeries: {
        'Barely Started': MIN_COMPLETED_EPISODES - 1,
        'Properly Watched': MIN_COMPLETED_EPISODES,
      },
    });

    expect(signals.watched).toEqual([{ id: 'Properly Watched', kind: 'series' }]);
  });

  it('keeps a watched id that is also reacted to, since the engine de-duplicates', () => {
    const signals = buildRecommendationSignals({
      ...EMPTY_INPUT,
      reactions: { 'movie-1': 1 },
      completedChannelIds: ['movie-1'],
    });

    expect(signals.watched).toEqual([{ id: 'movie-1', kind: 'movie' }]);
  });
});

describe('recommendationMode', () => {
  it('is random without a loaded model, whatever the signals say', () => {
    const signals = buildRecommendationSignals({ ...EMPTY_INPUT, favoriteIds: ['movie-1'] });

    expect(recommendationMode(signals, false)).toBe('random');
  });

  it('is personalized for a single reaction or a single favorite', () => {
    const reacted = buildRecommendationSignals({ ...EMPTY_INPUT, reactions: { 'movie-1': -1 } });
    const favorited = buildRecommendationSignals({ ...EMPTY_INPUT, favoriteIds: ['movie-1'] });

    expect(recommendationMode(reacted, true)).toBe('personalized');
    expect(recommendationMode(favorited, true)).toBe('personalized');
  });

  it('is popular for a user who has only been watching', () => {
    expect(recommendationMode(watchedSignals(MIN_WATCHED_FOR_TASTE - 1), true)).toBe('popular');
  });

  it('is personalized once enough watched signals accumulate', () => {
    expect(recommendationMode(watchedSignals(MIN_WATCHED_FOR_TASTE), true)).toBe('personalized');
  });

  it('is popular when the seen set is all there is', () => {
    const signals = buildRecommendationSignals({ ...EMPTY_INPUT, seenChannelIds: ['watched-1'] });

    expect(recommendationMode(signals, true)).toBe('popular');
  });
});
