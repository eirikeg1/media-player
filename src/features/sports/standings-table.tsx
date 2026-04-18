import { Dropdown, type DropdownOption } from '@/components/ui/controls/inputs/dropdown';
import { ThemedText } from '@/components/ui/display/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { GlassColors, THEME } from '@/lib/theme';
import { Image } from 'expo-image';
import type { Standing, StandingEntry } from 'expo-m3u-parser';
import { memo, useMemo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

interface StandingsTableProps {
  standings: Standing[];
  isLoading: boolean;
  error: string | null;
  competitionOptions: DropdownOption<number>[];
  selectedCompetitionId: number | null;
  onSelectCompetition: (id: number) => void;
  hideDropdown?: boolean;
}

const StandingRow = memo(function StandingRow({
  entry,
  isDark,
}: {
  entry: StandingEntry;
  isDark: boolean;
}) {
  return (
    <View
      style={[
        styles.row,
        { borderBottomColor: isDark ? GlassColors.dark.border : GlassColors.light.border },
      ]}
    >
      <ThemedText style={styles.colPosition}>{entry.position}</ThemedText>
      <View style={styles.colTeam}>
        {entry.teamCrest ? (
          <Image source={{ uri: entry.teamCrest }} style={styles.crest} contentFit="contain" />
        ) : null}
        <ThemedText style={styles.teamName} numberOfLines={1}>
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
  competitionOptions,
  selectedCompetitionId,
  onSelectCompetition,
  hideDropdown,
}: StandingsTableProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const destructiveColor = THEME[colorScheme ?? 'light'].destructive;

  const activeStanding = useMemo(
    () => standings.find((s) => s.standingType === 'TOTAL') ?? standings[0],
    [standings]
  );

  if (competitionOptions.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <ThemedText style={styles.emptyText}>
          Add favorite teams to see standings
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
            accessibilityLabel="Select competition for standings"
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
              <StandingRow key={entry.teamId} entry={entry} isDark={isDark} />
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
  colStat: {
    width: 32,
    textAlign: 'center',
    fontSize: 13,
  },
  colPoints: {
    fontWeight: '700',
  },
});
