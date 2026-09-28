import { ThemedText } from '@/components/ui/display/themed-text';
import { ErrorState } from '@/components/ui/display/state';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { GlassColors } from '@/lib/theme';
import { Image } from 'expo-image';
import type { Scorer, TopScorers } from 'expo-m3u-parser';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { ScorersSkeleton } from './skeletons';

interface ScorersListProps {
  scorers: TopScorers | null;
  isLoading: boolean;
  error: string | null;
  /** Load the chart again after a failure. */
  onRetry?: () => void;
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
  const assists =
    scorer.assists != null
      ? `, ${scorer.assists} ${scorer.assists === 1 ? 'assist' : 'assists'}`
      : '';

  return (
    <View
      // One announcement per player: the name, team and tallies belong together.
      accessible
      accessibilityLabel={`${rank}. ${scorer.playerName}, ${scorer.teamName}, ${scorer.goals} ${scorer.goals === 1 ? 'goal' : 'goals'}${assists}`}
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
  onRetry,
}: ScorersListProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <View style={styles.container}>
      {isLoading ? (
        <ScorersSkeleton />
      ) : error ? (
        <ErrorState inline message={error} onRetry={onRetry} />
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
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    opacity: 0.6,
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
