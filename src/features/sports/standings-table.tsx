import { ThemedText } from '@/components/ui/display/themed-text';
import { ErrorState } from '@/components/ui/display/state';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { GlassColors } from '@/lib/theme';
import { Image } from 'expo-image';
import type { Standing, StandingEntry } from 'expo-m3u-parser';
import { memo, useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { StandingsSkeleton } from './skeletons';
import { SPORTS_ACCENT, withAlpha } from './sports-theme';

interface StandingsTableProps {
  standings: Standing[];
  isLoading: boolean;
  error: string | null;
  /** Load the table again after a failure. */
  onRetry?: () => void;
  /** Provider ids of the user's favorite teams; their rows are highlighted. */
  favoriteTeamIds?: ReadonlySet<number>;
}

const FAVORITE_ROW_BACKGROUND = withAlpha(SPORTS_ACCENT.favorite, 0.12);

const StandingRow = memo(function StandingRow({
  entry,
  isDark,
  isFavorite,
}: {
  entry: StandingEntry;
  isDark: boolean;
  isFavorite: boolean;
}) {
  return (
    <View
      // One announcement per team instead of eight bare numbers whose column
      // headers scrolled off the side long ago.
      accessible
      accessibilityLabel={`${entry.position}. ${entry.teamName}, ${entry.playedGames} played, ${entry.won} won, ${entry.draw} drawn, ${entry.lost} lost, ${entry.points} points`}
      style={[
        styles.row,
        { borderBottomColor: isDark ? GlassColors.dark.border : GlassColors.light.border },
        isFavorite && { backgroundColor: FAVORITE_ROW_BACKGROUND },
      ]}
    >
      <ThemedText style={styles.colPosition}>{entry.position}</ThemedText>
      <View style={styles.colTeam}>
        {entry.teamCrest ? (
          <Image source={{ uri: entry.teamCrest }} style={styles.crest} contentFit="contain" />
        ) : null}
        <ThemedText style={[styles.teamName, isFavorite && styles.teamNameFavorite]} numberOfLines={1}>
          {entry.teamTla || entry.teamShortName || entry.teamName}
        </ThemedText>
      </View>
      <ThemedText style={styles.colStat}>{entry.playedGames}</ThemedText>
      <ThemedText style={styles.colStat}>{entry.won}</ThemedText>
      <ThemedText style={styles.colStat}>{entry.draw}</ThemedText>
      <ThemedText style={styles.colStat}>{entry.lost}</ThemedText>
      <ThemedText style={styles.colStat}>{entry.goalDifference > 0 ? `+${entry.goalDifference}` : entry.goalDifference}</ThemedText>
      <ThemedText style={[styles.colStat, styles.colPoints]}>{entry.points}</ThemedText>
    </View>
  );
});

export const StandingsTable = memo(function StandingsTable({
  standings,
  isLoading,
  error,
  onRetry,
  favoriteTeamIds,
}: StandingsTableProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const activeStanding = useMemo(
    () => standings.find((s) => s.standingType === 'TOTAL') ?? standings[0],
    [standings]
  );

  return (
    <View style={styles.container}>
      {isLoading ? (
        <StandingsSkeleton />
      ) : error ? (
        <ErrorState inline message={error} onRetry={onRetry} />
      ) : activeStanding ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            <View
              style={[
                styles.headerRow,
                { borderBottomColor: isDark ? GlassColors.dark.border : GlassColors.light.border },
              ]}
            >
              <ThemedText style={[styles.colPosition, styles.headerText]}>#</ThemedText>
              <View style={styles.colTeam}>
                <ThemedText style={styles.headerText}>Team</ThemedText>
              </View>
              <ThemedText style={[styles.colStat, styles.headerText]}>P</ThemedText>
              <ThemedText style={[styles.colStat, styles.headerText]}>W</ThemedText>
              <ThemedText style={[styles.colStat, styles.headerText]}>D</ThemedText>
              <ThemedText style={[styles.colStat, styles.headerText]}>L</ThemedText>
              <ThemedText style={[styles.colStat, styles.headerText]}>GD</ThemedText>
              <ThemedText style={[styles.colStat, styles.colPoints, styles.headerText]}>Pts</ThemedText>
            </View>
            {activeStanding.table.map((entry) => (
              <StandingRow
                key={entry.teamId}
                entry={entry}
                isDark={isDark}
                isFavorite={favoriteTeamIds?.has(entry.teamId) ?? false}
              />
            ))}
          </View>
        </ScrollView>
      ) : (
        <View style={styles.emptyContainer}>
          <ThemedText style={styles.emptyText}>No standings available</ThemedText>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  headerText: {
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.7,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  colPosition: {
    width: 28,
    textAlign: 'center',
    fontSize: 13,
  },
  colTeam: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 140,
    gap: 6,
  },
  crest: {
    width: 20,
    height: 20,
  },
  teamName: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  teamNameFavorite: {
    fontWeight: '700',
  },
  colStat: {
    width: 32,
    textAlign: 'center',
    fontSize: 13,
  },
  colPoints: {
    fontWeight: '700',
  },
});
