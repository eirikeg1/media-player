import { IconSymbol } from '@/components/ui/display/icon-symbol';
import type { Fixture } from 'expo-m3u-parser';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FAINT, MUTED } from './match-detail-shared';

interface MatchOverviewTabProps {
  fixture: Fixture;
}

interface Fact {
  icon: 'calendar' | 'clock' | 'flag' | 'sportscourt.fill' | 'list.bullet';
  label: string;
  value: string;
}

/** Match facts: kickoff, competition, round and venue. */
export const MatchOverviewTab = memo(function MatchOverviewTab({ fixture }: MatchOverviewTabProps) {
  const kickoff = new Date(fixture.kickoffTime * 1000);
  const facts: Fact[] = [
    {
      icon: 'calendar',
      label: 'Date',
      value: kickoff.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }),
    },
    {
      icon: 'clock',
      label: 'Kick-off',
      value: kickoff.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
    {
      icon: 'flag',
      label: 'Competition',
      value: fixture.competitionCountry
        ? `${fixture.competitionName} · ${fixture.competitionCountry}`
        : fixture.competitionName,
    },
  ];
  if (fixture.matchday) facts.push({ icon: 'list.bullet', label: 'Round', value: `Matchday ${fixture.matchday}` });
  if (fixture.venue) facts.push({ icon: 'sportscourt.fill', label: 'Venue', value: fixture.venue });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Match facts</Text>
      <View style={styles.card}>
        {facts.map((fact, index) => (
          <View key={fact.label} style={[styles.row, index < facts.length - 1 && styles.rowDivider]}>
            <IconSymbol name={fact.icon} size={16} color={MUTED} />
            <Text style={styles.label}>{fact.label}</Text>
            <Text style={styles.value} numberOfLines={2}>
              {fact.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  card: {
    borderRadius: 12,
    backgroundColor: FAINT,
    paddingHorizontal: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  label: {
    color: MUTED,
    fontSize: 13,
    width: 92,
  },
  value: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'right',
  },
});
