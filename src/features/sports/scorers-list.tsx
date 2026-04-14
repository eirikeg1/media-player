import { Dropdown, type DropdownOption } from '@/components/ui/controls/inputs/dropdown';
import { ThemedText } from '@/components/ui/display/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { GlassColors, THEME } from '@/lib/theme';
import { Image } from 'expo-image';
import type { Scorer, TopScorers } from 'expo-m3u-parser';
import { memo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

interface ScorersListProps {
  scorers: TopScorers | null;
  isLoading: boolean;
  error: string | null;
  competitionOptions: DropdownOption<number>[];
  selectedCompetitionId: number | null;
  onSelectCompetition: (id: number) => void;
  hideDropdown?: boolean;
}

const ScorerRow = memo(function ScorerRow({
  scorer,
  rank,
  isDark,
}: {
  scorer: Scorer;
  rank: number;
  isDark: boolean;
}) {
  return (
    <View
      style={[
        styles.row,
        { borderBottomColor: isDark ? GlassColors.dark.border : GlassColors.light.border },
      ]}
    >
      <ThemedText style={styles.rank}>{rank}</ThemedText>
      <View style={styles.playerInfo}>
        <ThemedText style={styles.playerName} numberOfLines={1}>
          {scorer.playerName}
        </ThemedText>
        <View style={styles.teamInfo}>
          {scorer.teamCrest ? (
            <Image source={{ uri: scorer.teamCrest }} style={styles.crest} contentFit="contain" />
          ) : null}
          <ThemedText style={styles.teamName} numberOfLines={1}>
            {scorer.teamName}
          </ThemedText>
        </View>
      </View>
      <View style={styles.stats}>
        <ThemedText style={styles.goals}>{scorer.goals}</ThemedText>
        {scorer.assists != null && (
          <ThemedText style={styles.assists}>
            {scorer.assists} {scorer.assists === 1 ? 'assist' : 'assists'}
          </ThemedText>
        )}
      </View>
    </View>
  );
});

export const ScorersList = memo(function ScorersList({
  scorers,
  isLoading,
  error,
  competitionOptions,
  selectedCompetitionId,
  onSelectCompetition,
  hideDropdown,
}: ScorersListProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const destructiveColor = THEME[colorScheme ?? 'light'].destructive;

  if (competitionOptions.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <ThemedText style={styles.emptyText}>
          Add favorite teams to see top scorers
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {!hideDropdown && (
        <View style={styles.dropdownWrapper}>
          <Dropdown
            options={competitionOptions}
            value={selectedCompetitionId ?? 0}
            onSelect={onSelectCompetition}
            placeholder="Select competition"
            accessibilityLabel="Select competition for scorers"
          />
        </View>
      )}

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator />
        </View>
      ) : error ? (
        <View style={styles.emptyContainer}>
          <ThemedText style={[styles.errorText, { color: destructiveColor }]}>{error}</ThemedText>
        </View>
      ) : scorers?.scorers && scorers.scorers.length > 0 ? (
        <View>
          {scorers.scorers.map((scorer, index) => (
            <ScorerRow key={scorer.playerId} scorer={scorer} rank={index + 1} isDark={isDark} />
          ))}
        </View>
      ) : (
        <View style={styles.emptyContainer}>
          <ThemedText style={styles.emptyText}>No scorers available</ThemedText>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: 12,
    paddingHorizontal: 16,
  },
  dropdownWrapper: {
    paddingBottom: 4,
  },
  loadingContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    opacity: 0.6,
  },
  errorText: {
    opacity: 0.7,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rank: {
    width: 28,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    opacity: 0.7,
  },
  playerInfo: {
    flex: 1,
    gap: 2,
  },
  playerName: {
    fontSize: 15,
    fontWeight: '500',
  },
  teamInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  crest: {
    width: 16,
    height: 16,
  },
  teamName: {
    fontSize: 12,
    opacity: 0.6,
  },
  stats: {
    alignItems: 'flex-end',
    minWidth: 40,
  },
  goals: {
    fontSize: 18,
    fontWeight: '700',
  },
  assists: {
    fontSize: 12,
    opacity: 0.6,
  },
});
