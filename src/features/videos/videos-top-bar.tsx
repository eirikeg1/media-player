import { Button } from '@/components/ui/controls/button';
import { Input } from '@/components/ui/controls/inputs/input';
import { ChannelGroupButton } from '@/features/live/channel-group-button';
import { StyleSheet, View } from 'react-native';

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
}: VideosTopBarProps) {
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

        {/* Group Selector Button */}
        <View style={styles.buttonContainer}>
          <ChannelGroupButton
            groups={groups}
            selectedGroupName={selectedGroupName}
            onGroupSelect={onGroupSelect}
            favoriteGroups={favoriteGroups}
            onToggleFavoriteGroup={onToggleFavoriteGroup}
          />
        </View>

        {/* Search Input */}
        <View style={styles.searchContainer}>
          <Input
            placeholder="Search videos..."
            value={searchText}
            onChangeText={onSearchTextChange}
            style={styles.searchInput}
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
  buttonContainer: {
    alignSelf: 'flex-start',
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  searchInput: {
    flex: 1,
    minHeight: 24,
    fontSize: 14,
  },
});
