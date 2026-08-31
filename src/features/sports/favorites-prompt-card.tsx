import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { ThemedText } from '@/components/ui/display/themed-text';
import { memo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { SPORTS_ACCENT, useSportsPalette, withAlpha } from './sports-theme';

interface FavoritesPromptCardProps {
  /** Opens the favorite-teams picker. */
  onAddTeams: () => void;
}

const STAR_BACKGROUND = withAlpha(SPORTS_ACCENT.favorite, 0.16);

/** Nudge shown above the list while the user follows no teams. */
export const FavoritesPromptCard = memo(function FavoritesPromptCard({ onAddTeams }: FavoritesPromptCardProps) {
  const palette = useSportsPalette();

  return (
    <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
      <View style={[styles.iconBox, { backgroundColor: STAR_BACKGROUND }]}>
        <IconSymbol name="star.fill" size={18} color={SPORTS_ACCENT.favorite} />
      </View>
      <View style={styles.texts}>
        <ThemedText style={styles.title}>Follow your teams</ThemedText>
        <ThemedText style={[styles.subtitle, { color: palette.muted }]}>
          Their matches pin to the top
        </ThemedText>
      </View>
      <TouchableOpacity
        onPress={onAddTeams}
        style={styles.button}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Add favorite teams"
      >
        <ThemedText style={styles.buttonText}>Add teams</ThemedText>
      </TouchableOpacity>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 1,
  },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: SPORTS_ACCENT.tint,
  },
  buttonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
