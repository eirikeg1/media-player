import { ThemedText } from '@/components/ui/display/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { GlassColors } from '@/lib/theme';
import { Image } from 'expo-image';
import type { Fixture } from 'expo-m3u-parser';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

interface FixtureItemProps {
  fixture: Fixture;
}

function formatKickoffTime(ts: number): string {
  const date = new Date(ts * 1000);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getStatusLabel(status: string, kickoffTime: number): { text: string; color: string } {
  switch (status.toUpperCase()) {
    case 'IN_PLAY':
    case 'LIVE':
      return { text: 'LIVE', color: '#FF3B30' };
    case 'FINISHED':
      return { text: 'FT', color: '#8E8E93' };
    case 'PAUSED':
    case 'HALFTIME':
      return { text: 'HT', color: '#FF9500' };
    case 'SCHEDULED':
    case 'TIMED':
    default:
      return { text: formatKickoffTime(kickoffTime), color: '#007AFF' };
  }
}

export const FixtureItem = memo(function FixtureItem({ fixture }: FixtureItemProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const status = getStatusLabel(fixture.status, fixture.kickoffTime);

  const normalizedStatus = fixture.status.toUpperCase();
  const showScore = normalizedStatus !== 'SCHEDULED' && normalizedStatus !== 'TIMED';
  const centerText = showScore
    ? `${fixture.homeScore ?? '-'} - ${fixture.awayScore ?? '-'}`
    : formatKickoffTime(fixture.kickoffTime);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: isDark ? GlassColors.dark.surface : GlassColors.light.surface,
          borderColor: isDark ? GlassColors.dark.border : GlassColors.light.border,
        },
      ]}
    >
      <ThemedText style={styles.competition} numberOfLines={1}>
        {fixture.competitionName}
      </ThemedText>
      <View style={styles.matchRow}>
        <View style={styles.team}>
          {fixture.homeTeamCrest ? (
            <Image source={{ uri: fixture.homeTeamCrest }} style={styles.crest} contentFit="contain" />
          ) : null}
          <ThemedText style={styles.teamName} numberOfLines={1}>
            {fixture.homeTeamShort || fixture.homeTeam}
          </ThemedText>
        </View>

        <View style={styles.center}>
          <ThemedText style={[styles.score, { color: status.color }]}>
            {centerText}
          </ThemedText>
          {showScore && (
            <ThemedText style={[styles.statusBadge, { color: status.color }]}>
              {status.text}
            </ThemedText>
          )}
        </View>

        <View style={[styles.team, styles.teamRight]}>
          {fixture.awayTeamCrest ? (
            <Image source={{ uri: fixture.awayTeamCrest }} style={styles.crest} contentFit="contain" />
          ) : null}
          <ThemedText style={styles.teamName} numberOfLines={1}>
            {fixture.awayTeamShort || fixture.awayTeam}
          </ThemedText>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  competition: {
    fontSize: 11,
    opacity: 0.6,
    textAlign: 'center',
    fontWeight: '500',
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  team: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  teamRight: {
    flexDirection: 'row-reverse',
  },
  crest: {
    width: 24,
    height: 24,
  },
  teamName: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  center: {
    alignItems: 'center',
    paddingHorizontal: 12,
    minWidth: 70,
  },
  score: {
    fontSize: 18,
    fontWeight: '700',
  },
  statusBadge: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
});
