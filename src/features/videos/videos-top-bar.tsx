import { SortButton } from '@/components/domain/sort/sort-button';
import { Button } from '@/components/ui/controls/button';
import { Input } from '@/components/ui/controls/inputs/input';
import { ChannelGroupButton } from '@/features/live/channel-group-button';
import type { SortOption } from '@/types/sort.types';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

/**
 * How long the field waits before publishing a keystroke upwards. Short on
 * purpose: this only coalesces a burst of typing into one screen render — the
 * query itself is debounced again by `usePaginatedResource`.
 */
const SEARCH_INPUT_DEBOUNCE_MS = 150;

interface GroupOption {
  name: string;
  channelCount: number;
}

interface VideosTopBarProps {
  contentType: 'movie' | 'series';
  onContentTypeChange: (type: 'movie' | 'series') => void;
  groups: GroupOption[];
  selectedGroupName: string;
  onGroupSelect: (groupName: string) => void;
  searchText: string;
  onSearchTextChange: (text: string) => void;
  favoriteGroups: string[];
  onToggleFavoriteGroup: (name: string) => void;
  sortOptions: SortOption[];
  selectedSortId: string;
  sortOrder: 'asc' | 'desc';
  onSortSelect: (id: string) => void;
}

export function VideosTopBar({
  contentType,
  onContentTypeChange,
  groups,
  selectedGroupName,
  onGroupSelect,
  searchText,
  onSearchTextChange,
  favoriteGroups,
  onToggleFavoriteGroup,
  sortOptions,
  selectedSortId,
  sortOrder,
  onSortSelect,
}: VideosTopBarProps) {
  // The text being typed lives here, not at the screen root: every keystroke
  // there re-rendered the whole grid.
  const [draftText, setDraftText] = useState(searchText);

  // Adopt an external reset. The screen only ever *clears* the search - on a
  // playlist or content-type change - so that is the one incoming value worth
  // reacting to; anything else it sends is the echo of what this field just
  // published, which must not overwrite what is being typed now. The content
  // type is part of the key because switching it clears a search that may
  // already have been empty.
  const resetKey = contentType + '|' + searchText;
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey);
    if (searchText === '') setDraftText('');
  }

  // Publish only what the screen doesn't have yet, once the typing pauses.
  useEffect(() => {
    if (draftText === searchText) return;
    const timer = setTimeout(() => onSearchTextChange(draftText), SEARCH_INPUT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draftText, searchText, onSearchTextChange]);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* VOD / Series Toggle */}
        <View style={styles.toggleRow}>
          <Button
            title="Movies"
            onPress={() => onContentTypeChange('movie')}
            variant={contentType === 'movie' ? 'primary' : 'secondary'}
            size="large"
            style={styles.toggleButton}
          />
          <Button
            title="Series"
            onPress={() => onContentTypeChange('series')}
            variant={contentType === 'series' ? 'primary' : 'secondary'}
            size="large"
            style={styles.toggleButton}
          />
        </View>

        {/* Group Selector */}
        <ChannelGroupButton
          groups={groups}
          selectedGroupName={selectedGroupName}
          onGroupSelect={onGroupSelect}
          favoriteGroups={favoriteGroups}
          onToggleFavoriteGroup={onToggleFavoriteGroup}
        />

        {/* Search Input + Sort Button */}
        <View style={styles.searchRow}>
          <Input
            placeholder="Search videos..."
            value={draftText}
            onChangeText={setDraftText}
            style={styles.searchInput}
          />
          <SortButton
            options={sortOptions}
            selectedId={selectedSortId}
            sortOrder={sortOrder}
            onSelect={onSortSelect}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 8,
    paddingBottom: 2,
  },
  content: {
    flexDirection: 'column',
    gap: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  toggleButton: {
    flex: 1,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    minHeight: 24,
    fontSize: 14,
  },
});
