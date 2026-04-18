import { Button } from '@/components/ui/controls/button';
import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { ThemedText } from '@/components/ui/display/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

interface SportsEmptyStateProps {
  variant?: 'no-teams' | 'not-configured';
  onAddTeams?: () => void;
}

export const SportsEmptyState = memo(function SportsEmptyState({
  variant = 'no-teams',
  onAddTeams,
}: SportsEmptyStateProps) {
  const iconColor = useThemeColor({}, 'icon');

  if (variant === 'not-configured') {
    return (
      <View style={styles.container}>
        <IconSymbol name="sportscourt.fill" size={64} color={iconColor} style={styles.icon} />
        <ThemedText type="subtitle" style={styles.title}>
          Sports Not Available
        </ThemedText>
        <ThemedText style={styles.description}>
          The sports API key is not configured. Add FOOTBALL_DATA_ORG_API_KEY to your .env file to
          enable fixtures, standings, and top scorers.
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <IconSymbol name="sportscourt.fill" size={64} color={iconColor} style={styles.icon} />
      <ThemedText type="subtitle" style={styles.title}>
        No Favorite Teams
      </ThemedText>
      <ThemedText style={styles.description}>
        Add your favorite teams to see upcoming fixtures, standings, and top scorers.
      </ThemedText>
      {onAddTeams && (
        <Button
          title="Add Teams"
          icon="plus"
          onPress={onAddTeams}
          style={styles.button}
        />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 12,
  },
  icon: {
    opacity: 0.5,
    marginBottom: 8,
  },
  title: {
    textAlign: 'center',
  },
  description: {
    textAlign: 'center',
    opacity: 0.6,
    fontSize: 15,
  },
  button: {
    marginTop: 8,
  },
});
