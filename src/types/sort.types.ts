/** Server-side orderings a channel query can ask for; absent means playlist order. */
export type ChannelSortBy = 'title' | 'group' | 'tvgName';

export interface SortOption {
  id: string;
  label: string;
  sortBy?: ChannelSortBy;
  defaultOrder: 'asc' | 'desc';
}

export const LIVE_SORT_OPTIONS: SortOption[] = [
  { id: 'playlist', label: 'Playlist Order', defaultOrder: 'asc' },
  { id: 'alphabetical', label: 'Alphabetical', sortBy: 'title', defaultOrder: 'asc' },
];

export const MOVIE_SORT_OPTIONS: SortOption[] = [
  { id: 'alphabetical', label: 'Alphabetical', sortBy: 'title', defaultOrder: 'asc' },
  { id: 'playlist', label: 'Playlist Order', defaultOrder: 'asc' },
];

export const SERIES_SORT_OPTIONS: SortOption[] = [
  { id: 'alphabetical', label: 'Alphabetical', defaultOrder: 'asc' },
];

export type GroupSortOption = 'alphabetical' | 'channelCount' | 'playlistOrder';
