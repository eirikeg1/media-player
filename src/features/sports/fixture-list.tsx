import { ThemedText } from '@/components/ui/display/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { THEME } from '@/lib/theme';
import type { Fixture } from 'expo-m3u-parser';
import { memo, useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { FixtureItem } from './fixture-item';

interface FixtureListProps {
  fixtures: Fixture[];
  isLoading: boolean;
  error: string | null;
  onFixturePress?: (fixture: Fixture) => void;
}

interface DateGroup {
  label: string;
  fixtures: Fixture[];
}

function groupByDate(fixtures: Fixture[]): DateGroup[] {
  const groups = new Map<string, Fixture[]>();
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todayStr = today.toDateString();
  const tomorrowStr = tomorrow.toDateString();

  for (const fixture of fixtures) {
    const date = new Date(fixture.kickoffTime * 1000);
    const dateStr = date.toDateString();

    let label: string;
    if (dateStr === todayStr) {
      label = 'Today';
    } else if (dateStr === tomorrowStr) {
      label = 'Tomorrow';
    } else {
      label = date.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      });
    }

    const existing = groups.get(label);
    if (existing) {
      existing.push(fixture);
    } else {
      groups.set(label, [fixture]);
    }
  }

  const result = Array.from(groups.entries()).map(([label, fixtures]) => ({ label, fixtures }));

  // Sort groups chronologically by the first fixture's kickoff time
  result.sort((a, b) => a.fixtures[0].kickoffTime - b.fixtures[0].kickoffTime);

  return result;
}

export const FixtureList = memo(function FixtureList({ fixtures, isLoading, error, onFixturePress }: FixtureListProps) {
  const colorScheme = useColorScheme();
  const destructiveColor = THEME[colorScheme ?? 'light'].destructive;
  const dateGroups = useMemo(() => groupByDate(fixtures), [fixtures]);

  if (isLoading && fixtures.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator />
      </View>
    );
  }

  if (error && fixtures.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <ThemedText style={[styles.errorText, { color: destructiveColor }]}>{error}</ThemedText>
      </View>
    );
  }

  if (fixtures.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <ThemedText style={styles.emptyText}>No upcoming fixtures</ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {dateGroups.map((group) => (
        <View key={group.label} style={styles.dateGroup}>
          <ThemedText style={styles.dateHeader}>{group.label}</ThemedText>
          <View style={styles.fixturesList}>
            {group.fixtures.map((fixture) => (
              <FixtureItem
                key={fixture.providerId}
                fixture={fixture}
                onPress={onFixturePress}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: 16,
    paddingHorizontal: 16,
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
  dateGroup: {
    gap: 8,
  },
  dateHeader: {
    fontSize: 14,
    fontWeight: '600',
    opacity: 0.7,
  },
  fixturesList: {
    gap: 8,
  },
});
