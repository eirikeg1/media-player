import { EmptyState, ErrorState } from '@/components/ui/display/state';
import { FAVORITES_GROUP_SENTINEL } from '@/lib/group-utils';

interface VideosEmptyStateProps {
  searchText: string;
  selectedGroupName: string;
  /** Favorites filter is on, but none of the favorite groups exist here. */
  hasUnmatchedFavoriteGroups?: boolean;
  /** Message from a failed content or group query, if any. */
  error?: string | null;
  onRetry?: () => void;
  contentType: 'movie' | 'series';
}

/** Human-readable label for a group filter — never the raw sentinel string. */
function groupLabel(selectedGroupName: string): string {
  return selectedGroupName === FAVORITES_GROUP_SENTINEL ? 'Favorite Groups' : selectedGroupName;
}

export function VideosEmptyState({
  searchText,
  selectedGroupName,
  hasUnmatchedFavoriteGroups = false,
  error,
  onRetry,
  contentType,
}: VideosEmptyStateProps) {
  const contentLabel = contentType === 'movie' ? 'movies' : 'series';
  const contentTitle = contentType === 'movie' ? 'Movies' : 'Series';

  // A failure must never read as "this playlist has no movies".
  if (error) {
    return <ErrorState title={`Couldn't Load ${contentTitle}`} message={error} onRetry={onRetry} />;
  }

  const isSearching = searchText.trim().length > 0;

  return (
    <EmptyState
      icon={isSearching ? 'magnifyingglass' : 'film.fill'}
      title={isSearching ? 'No Results' : `No ${contentTitle}`}
      message={
        isSearching
          ? `No ${contentLabel} found for "${searchText}"`
          : hasUnmatchedFavoriteGroups
          ? 'None of your favorite groups are in this playlist'
          : selectedGroupName
          ? `No ${contentLabel} found in "${groupLabel(selectedGroupName)}"`
          : `This playlist doesn't contain any ${contentLabel}`
      }
    />
  );
}
