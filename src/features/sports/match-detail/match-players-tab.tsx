import type { MatchPlayers, PlayerEntry, TeamLineup } from 'expo-m3u-parser';
import { memo, useState } from 'react';
import { LayoutAnimation, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, UIManager, View } from 'react-native';

import type { MatchDataState } from '../hooks/use-match-detail';
import {
  AWAY_COLOR,
  buildPlayerStats,
  FAINT,
  HOME_COLOR,
  MUTED,
  RatingBadge,
  SectionLoading,
  SectionMessage,
  StatGrid,
} from './match-detail-shared';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface PlayersTabProps {
  state: MatchDataState<MatchPlayers>;
  homeLabel: string;
  awayLabel: string;
  /** Landscape: place the two teams side by side so each column is narrower
   * and the wide card's horizontal space is used instead of stretching rows. */
  compact?: boolean;
}

interface BestPlayer {
  player: PlayerEntry;
  teamLabel: string;
  accent: string;
}

export const MatchPlayersTab = memo(function MatchPlayersTab({
  state,
  homeLabel,
  awayLabel,
  compact = false,
}: PlayersTabProps) {
  if (state.isLoading) return <SectionLoading />;
  if (state.error) return <SectionMessage text={state.error} />;

  const players = state.data;
  if (!players || !players.available) {
    return <SectionMessage text="Player ratings appear once lineups are released." />;
  }

  const motm = bestPlayer(players, homeLabel, awayLabel);

  return (
    <ScrollView style={styles.fill} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {motm && <PlayerOfTheMatch best={motm} />}
      {compact ? (
        <View style={styles.teamsRow}>
          <View style={styles.teamColumn}>
            <TeamPlayers label={homeLabel} lineup={players.home} accent={HOME_COLOR} />
          </View>
          <View style={styles.teamColumn}>
            <TeamPlayers label={awayLabel} lineup={players.away} accent={AWAY_COLOR} />
          </View>
        </View>
      ) : (
        <>
          <TeamPlayers label={homeLabel} lineup={players.home} accent={HOME_COLOR} />
          <TeamPlayers label={awayLabel} lineup={players.away} accent={AWAY_COLOR} />
        </>
      )}
    </ScrollView>
  );
});

function bestPlayer(players: MatchPlayers, homeLabel: string, awayLabel: string): BestPlayer | null {
  let best: BestPlayer | null = null;
  const consider = (list: PlayerEntry[], teamLabel: string, accent: string) => {
    for (const player of list) {
      if (player.rating == null) continue;
      if (!best || player.rating > best.player.rating!) {
        best = { player, teamLabel, accent };
      }
    }
  };
  consider(players.home.players, homeLabel, HOME_COLOR);
  consider(players.away.players, awayLabel, AWAY_COLOR);
  return best;
}

function PlayerOfTheMatch({ best }: { best: BestPlayer }) {
  const { player } = best;
  return (
    <View style={styles.motmCard}>
      <Text style={styles.motmStar}>★</Text>
      <View style={styles.motmInfo}>
        <Text style={styles.motmCaption}>Player of the match</Text>
        <Text style={styles.motmName} numberOfLines={1}>
          {player.name}
        </Text>
        <View style={styles.motmTeamRow}>
          <View style={[styles.teamDot, { backgroundColor: best.accent }]} />
          <Text style={styles.motmTeam} numberOfLines={1}>
            {best.teamLabel}
          </Text>
        </View>
      </View>
      {player.rating != null && <RatingBadge rating={player.rating} />}
    </View>
  );
}

function TeamPlayers({
  label,
  lineup,
  accent,
}: {
  label: string;
  lineup: TeamLineup;
  accent: string;
}) {
  const starters = lineup.players.filter((p) => !p.substitute);
  const subs = lineup.players.filter((p) => p.substitute);
  if (!starters.length && !subs.length) return null;

  return (
    <View style={styles.team}>
      <View style={styles.teamHeader}>
        <View style={[styles.teamDot, { backgroundColor: accent }]} />
        <Text style={styles.teamName} numberOfLines={1}>
          {label}
        </Text>
        {lineup.formation && <Text style={styles.formation}>{lineup.formation}</Text>}
      </View>
      {starters.map((player) => (
        <PlayerRow key={player.id} player={player} />
      ))}
      {subs.length > 0 && (
        <>
          <Text style={styles.subsLabel}>Substitutes</Text>
          {subs.map((player) => (
            <PlayerRow key={player.id} player={player} />
          ))}
        </>
      )}
    </View>
  );
}

function PlayerRow({ player }: { player: PlayerEntry }) {
  const [expanded, setExpanded] = useState(false);
  const stats = buildPlayerStats(player);
  const canExpand = stats.length > 0;

  const toggle = () => {
    if (!canExpand) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((value) => !value);
  };

  return (
    <View style={styles.playerWrap}>
      <TouchableOpacity
        style={styles.playerRow}
        onPress={toggle}
        activeOpacity={canExpand ? 0.6 : 1}
        accessibilityRole={canExpand ? 'button' : undefined}
      >
        <Text style={styles.shirt}>{player.jerseyNumber ?? '–'}</Text>
        <View style={styles.playerInfo}>
          <Text style={styles.playerName} numberOfLines={1}>
            {player.name}
            {player.captain ? <Text style={styles.captain}> (C)</Text> : null}
          </Text>
          <View style={styles.playerMetaRow}>
            {player.position && <Text style={styles.playerPosition}>{player.position}</Text>}
            {!!player.goals && <Badge text={`⚽ ${player.goals}`} />}
            {!!player.assists && <Badge text={`🅰 ${player.assists}`} />}
          </View>
        </View>
        {player.rating != null ? (
          <RatingBadge rating={player.rating} size="sm" />
        ) : (
          <Text style={styles.noRating}>–</Text>
        )}
      </TouchableOpacity>

      {expanded && <StatGrid stats={stats} style={styles.statGridCard} />}
    </View>
  );
}

function Badge({ text }: { text: string }) {
  return (
    <View style={styles.miniBadge}>
      <Text style={styles.miniBadgeText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 18,
    paddingBottom: 28,
  },
  teamsRow: {
    flexDirection: 'row',
    gap: 20,
    alignItems: 'flex-start',
  },
  teamColumn: {
    flex: 1,
  },
  motmCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255, 200, 0, 0.10)',
    borderColor: 'rgba(255, 200, 0, 0.35)',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
  },
  motmStar: {
    color: '#FFC800',
    fontSize: 24,
  },
  motmInfo: {
    flex: 1,
    gap: 2,
  },
  motmCaption: {
    color: '#FFC800',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  motmName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  motmTeamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  motmTeam: {
    color: MUTED,
    fontSize: 12,
  },
  team: {
    gap: 4,
  },
  teamHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  teamDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  teamName: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  formation: {
    color: MUTED,
    fontSize: 12,
    fontWeight: '600',
  },
  subsLabel: {
    color: MUTED,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 10,
    marginBottom: 2,
  },
  playerWrap: {
    borderRadius: 10,
    overflow: 'hidden',
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  shirt: {
    width: 22,
    textAlign: 'center',
    color: MUTED,
    fontSize: 13,
    fontWeight: '600',
  },
  playerInfo: {
    flex: 1,
    gap: 3,
  },
  playerName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  captain: {
    color: MUTED,
    fontSize: 12,
    fontWeight: '700',
  },
  playerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  playerPosition: {
    color: MUTED,
    fontSize: 11,
    fontWeight: '600',
  },
  miniBadge: {
    backgroundColor: FAINT,
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  miniBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
  noRating: {
    color: MUTED,
    fontSize: 14,
    width: 30,
    textAlign: 'center',
  },
  statGridCard: {
    backgroundColor: FAINT,
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
  },
});
