import { Button } from '@/components/ui/controls/button';
import { FAVORITES_GROUP_SENTINEL } from '@/lib/group-utils';
import { useState } from 'react';
import { GroupSelectionModal } from './group-selection-modal';

interface GroupOption {
  name: string;
  channelCount: number;
}

interface ChannelGroupButtonProps {
  groups: GroupOption[];
  selectedGroupName: string;
  onGroupSelect: (groupName: string) => void;
  favoriteGroups: string[];
  onToggleFavoriteGroup: (name: string) => void;
}

export function ChannelGroupButton({
  groups,
  selectedGroupName,
  onGroupSelect,
  favoriteGroups,
  onToggleFavoriteGroup,
}: ChannelGroupButtonProps) {
  const [isModalVisible, setIsModalVisible] = useState(false);

  const isFavorites = selectedGroupName === FAVORITES_GROUP_SENTINEL;

  const getDisplayText = () => {
    if (isFavorites) {
      return 'Favorite Groups';
    }
    if (!selectedGroupName) {
      return 'All Channels';
    }
    return selectedGroupName;
  };

  const handleButtonPress = () => {
    setIsModalVisible(true);
  };

  const handleModalClose = () => {
    setIsModalVisible(false);
  };

  const handleGroupSelect = (groupName: string) => {
    onGroupSelect(groupName);
    setIsModalVisible(false);
  };

  return (
    <>
      <Button
        title={getDisplayText()}
        onPress={handleButtonPress}
        variant="secondary"
        icon={isFavorites ? 'star.fill' : 'folder'}
        accessibilityLabel={`Currently showing ${getDisplayText()}. Tap to change channel group`}
        accessibilityHint="Opens channel group selection modal"
      />

      <GroupSelectionModal
        visible={isModalVisible}
        onClose={handleModalClose}
        groups={groups}
        selectedGroupName={selectedGroupName}
        onGroupSelect={handleGroupSelect}
        favoriteGroups={favoriteGroups}
        onToggleFavoriteGroup={onToggleFavoriteGroup}
      />
    </>
  );
}