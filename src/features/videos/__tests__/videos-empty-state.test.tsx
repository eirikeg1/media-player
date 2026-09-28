/**
 * What the videos grid says when it has nothing to show. A failed query and an
 * empty catalogue must never read the same, and the internal favorites sentinel
 * must never leak into the copy.
 */
import { VideosEmptyState } from '@/features/videos/videos-empty-state';
import { FAVORITES_GROUP_SENTINEL } from '@/lib/group-utils';
import { render, screen, userEvent } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

/** The shared empty state reads the safe-area insets, which need a provider. */
const SAFE_AREA_METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const renderState = (element: ReactElement) =>
  render(<SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>{element}</SafeAreaProvider>);

describe('VideosEmptyState', () => {
  it('reports a failed query as a failure, with a way to retry', async () => {
    const onRetry = jest.fn();
    await renderState(
      <VideosEmptyState
        searchText=""
        selectedGroupName=""
        error="Database is locked"
        onRetry={onRetry}
        contentType="movie"
      />
    );

    expect(screen.getByText("Couldn't Load Movies")).toBeTruthy();
    expect(screen.getByText('Database is locked')).toBeTruthy();
    // Not the "this playlist has no movies" copy.
    expect(screen.queryByText('No Movies')).toBeNull();

    await userEvent.press(screen.getByText('Retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('names the favorites filter in words, not by its sentinel', async () => {
    await renderState(
      <VideosEmptyState
        searchText=""
        selectedGroupName={FAVORITES_GROUP_SENTINEL}
        contentType="series"
      />
    );

    expect(screen.getByText('No series found in "Favorite Groups"')).toBeTruthy();
  });

  it('explains a favorites filter that matches no group here', async () => {
    await renderState(
      <VideosEmptyState
        searchText=""
        selectedGroupName={FAVORITES_GROUP_SENTINEL}
        hasUnmatchedFavoriteGroups
        contentType="movie"
      />
    );

    expect(
      screen.getByText('None of your favorite groups are in this playlist')
    ).toBeTruthy();
  });

  it('reports an unproductive search as a search result', async () => {
    await renderState(
      <VideosEmptyState searchText="dune" selectedGroupName="" contentType="movie" />
    );

    expect(screen.getByText('No Results')).toBeTruthy();
    expect(screen.getByText('No movies found for "dune"')).toBeTruthy();
  });
});
