import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { ThemedText } from '@/components/ui/display/themed-text';
import { Image } from 'expo-image';
import type { Fixture } from 'expo-m3u-parser';
import { memo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { getFixtureStatus, type FixtureStatusKind } from './fixture-status';
import { SPORTS_ACCENT, useSportsPalette } from './sports-theme';

interface MatchRowProps {
  fixture: Fixture;
  isFavorite?: boolean;
  onPress: (fixture: Fixture) => void;
  /** Draw a divider below the row (all but the last in a group). */
  showDivider?: boolean;
}

function statusColor(kind: FixtureStatusKind, muted: string): string {
  switch (kind) {
    case 'live':
      return SPORTS_ACCENT.live;
    case 'halftime':
      return SPORTS_ACCENT.halftime;
    default:
      return muted;
  }
}

/**
 * One match, FotMob-style: status column on the left, the two teams stacked
 * with their scores on the right. Live matches get a red accent bar.
 */
export const MatchRow = memo(function MatchRow({ fixture, isFavorite, onPress, showDivider }: MatchRowProps) {
  const palette = useSportsPalette();
  const status = getFixtureStatus(fixture);
  const isLive = status.kind === 'live' || status.kind === 'halftime';
  const isFinished = status.kind === 'finished';
  const homeWon = isFinished && (fixture.homeScore ?? 0) > (fixture.awayScore ?? 0);
  const awayWon = isFinished && (fixture.awayScore ?? 0) > (fixture.homeScore ?? 0);
  const scoreColor = isLive ? SPORTS_ACCENT.live : palette.text;

  return (
    <TouchableOpacity
      onPress={() => onPress(fixture)}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={`${fixture.homeTeam} versus ${fixture.awayTeam}, ${status.label}`}
      style={[styles.row, showDivider && { borderBottomColor: palette.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
    >
      {isLive && <View style={styles.liveBar} />}
      <View style={styles.statusColumn}>
        <ThemedText style={[styles.statusText, { color: statusColor(status.kind, palette.muted) }, isLive && styles.statusLive]}>
          {status.label}
        </ThemedText>
      </View>

      <View style={styles.teams}>
        <TeamLine
          name={fixture.homeTeam}
          crest={fixture.homeTeamCrest}
          score={status.showScore ? fixture.homeScore : undefined}
          scoreColor={scoreColor}
          dim={isFinished && !homeWon && !!awayWon}
          textColor={palette.text}
        />
        <TeamLine
          name={fixture.awayTeam}
          crest={fixture.awayTeamCrest}
          score={status.showScore ? fixture.awayScore : undefined}
          scoreColor={scoreColor}
          dim={isFinished && !awayWon && !!homeWon}
          textColor={palette.text}
        />
      </View>

      <View style={styles.trailing}>
        {isFavorite ? (
          <IconSymbol name="star.fill" size={14} color={SPORTS_ACCENT.favorite} />
        ) : (
          <IconSymbol name="chevron.right" size={14} color={palette.muted} />
        )}
      </View>
    </TouchableOpacity>
  );
});

function TeamLine({
  name,
  crest,
  score,
  scoreColor,
  dim,
  textColor,
}: {
  name: string;
  crest?: string;
  score?: number;
  scoreColor: string;
  dim: boolean;
  textColor: string;
}) {
  return (
    <View style={styles.teamLine}>
      {crest ? (
        <Image source={{ uri: crest }} style={styles.crest} contentFit="contain" transition={150} />
      ) : (
        <View style={styles.crest} />
      )}
      <ThemedText style={[styles.teamName, { color: textColor }, dim && styles.dim]} numberOfLines={1}>
        {name}
      </ThemedText>
      {score != null && (
        <ThemedText style={[styles.score, { color: scoreColor }, dim && styles.dim]}>{score}</ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingRight: 12,
    minHeight: 64,
  },
  liveBar: {
    position: 'absolute',
    left: 0,
    top: 12,
    bottom: 12,
    width: 3,
    borderRadius: 2,
    backgroundColor: SPORTS_ACCENT.live,
  },
  statusColumn: {
    width: 64,
    alignItems: 'center',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  statusLive: {
    fontWeight: '800',
  },
  teams: {
    flex: 1,
    gap: 6,
  },
  teamLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  crest: {
    width: 20,
    height: 20,
  },
  teamName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  score: {
    fontSize: 15,
    fontWeight: '700',
    minWidth: 18,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  dim: {
    opacity: 0.55,
  },
  trailing: {
    width: 24,
    alignItems: 'flex-end',
    marginLeft: 4,
  },
});
