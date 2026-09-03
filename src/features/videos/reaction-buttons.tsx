import { useCallback, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useUserStore } from '@/stores/user/user-store';
import type { ContentReactionValue } from '@/types/user.types';

interface ReactionButtonsProps {
  /** Content id following the favorites convention: channel id for movies, `series:`-prefixed id for series. */
  channelId: string;
  contentName: string;
  size?: number;
}

const MUTED_COLOR = 'rgba(160, 160, 160, 0.9)';

/**
 * Like/dislike thumbs for movies and series. Tapping the active thumb clears
 * the reaction; only one reaction is stored per content, so setting one
 * clears the other.
 */
export function ReactionButtons({ channelId, contentName, size = 22 }: ReactionButtonsProps) {
  const [isSaving, setIsSaving] = useState(false);

  const currentUser = useUserStore((state) => state.currentUser);
  const reaction = useUserStore((state) => state.contentReactions[channelId] ?? null);
  const setReaction = useUserStore((state) => state.setReaction);

  const tintColor = useThemeColor({}, 'tint');

  const handlePress = useCallback(
    async (value: ContentReactionValue) => {
      if (!currentUser || isSaving) return;

      setIsSaving(true);
      try {
        // Tapping the active thumb clears the reaction
        await setReaction(currentUser.id, channelId, reaction === value ? null : value);
      } catch (error) {
        console.error('[ReactionButtons] Error setting reaction:', error);
      } finally {
        setIsSaving(false);
      }
    },
    [currentUser, isSaving, channelId, reaction, setReaction]
  );

  if (!currentUser) return null;

  const isLiked = reaction === 1;
  const isDisliked = reaction === -1;

  return (
    <View style={styles.row}>
      <TouchableOpacity
        onPress={() => handlePress(1)}
        disabled={isSaving}
        activeOpacity={0.7}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={styles.button}
        accessibilityRole="button"
        accessibilityLabel={isLiked ? 'Remove like' : 'Like'}
        accessibilityHint={`${isLiked ? 'Remove your like from' : 'Like'} ${contentName}`}
      >
        <IconSymbol
          name={isLiked ? 'hand.thumbsup.fill' : 'hand.thumbsup'}
          size={size}
          color={isLiked ? tintColor : MUTED_COLOR}
        />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => handlePress(-1)}
        disabled={isSaving}
        activeOpacity={0.7}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={styles.button}
        accessibilityRole="button"
        accessibilityLabel={isDisliked ? 'Remove dislike' : 'Dislike'}
        accessibilityHint={`${isDisliked ? 'Remove your dislike from' : 'Dislike'} ${contentName}`}
      >
        <IconSymbol
          name={isDisliked ? 'hand.thumbsdown.fill' : 'hand.thumbsdown'}
          size={size}
          color={isDisliked ? tintColor : MUTED_COLOR}
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 32,
    marginBottom: 16,
  },
  button: {
    padding: 6,
  },
});
