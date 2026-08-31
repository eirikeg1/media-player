import { Image } from 'expo-image';
import type { MatchPlayers, PlayerEntry, TeamLineup } from 'expo-m3u-parser';
import { memo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { MatchDataState } from '../hooks/use-match-detail';
import {
  AWAY_COLOR,
  HOME_COLOR,
  MUTED,
  playerImageUrl,
  playerInitials,
  PlayerStatsSheet,
  RatingBadge,
  ratingColor,
  SectionLoading,
  SectionMessage,
} from './match-detail-shared';

interface SelectedPlayer {
  player: PlayerEntry;
  label: string;
  accent: string;
}

const PITCH_GREEN = '#1f7a40';
const LINE_COLOR = 'rgba(255, 255, 255, 0.25)';

interface LineupsTabProps {
  state: MatchDataState<MatchPlayers>;
  homeLabel: string;
  awayLabel: string;
  /** Landscape lays the pitch out horizontally (home left → away right) to use
   * the wide card; portrait stacks the teams vertically (home top → away bottom). */
  compact?: boolean;
}

export const MatchLineupsTab = memo(function MatchLineupsTab({
  state,
  homeLabel,
  awayLabel,
  compact = false,
}: LineupsTabProps) {
  const [selected, setSelected] = useState<SelectedPlayer | null>(null);

  if (state.isLoading) return <SectionLoading />;
  if (state.error) return <SectionMessage text={state.error} />;

  const players = state.data;
  if (!players || !players.available) {
    return <SectionMessage text="Lineups appear once the teams are announced." />;
  }

  const onSelect = (player: PlayerEntry, label: string, accent: string) =>
    setSelected({ player, label, accent });

  const motm = bestPlayer(players, homeLabel, awayLabel);

  return (
    <View style={styles.fill}>
      <ScrollView
        style={styles.fill}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {motm && (
          <PlayerOfTheMatch
            best={motm}
            onPress={() => onSelect(motm.player, motm.teamLabel, motm.accent)}
          />
        )}
        <FormationHeader
          home={players.home}
          away={players.away}
          homeLabel={homeLabel}
          awayLabel={awayLabel}
        />
        <Pitch
          home={players.home}
          away={players.away}
          horizontal={compact}
          homeLabel={homeLabel}
          awayLabel={awayLabel}
          onSelect={onSelect}
        />
        <Substitutes
          home={players.home}
          away={players.away}
          homeLabel={homeLabel}
          awayLabel={awayLabel}
          onSelect={onSelect}
        />
      </ScrollView>
      {selected && (
        <PlayerStatsSheet
          player={selected.player}
          teamLabel={selected.label}
          accent={selected.accent}
          onClose={() => setSelected(null)}
        />
      )}
    </View>
  );
});

interface BestPlayer {
  player: PlayerEntry;
  teamLabel: string;
  accent: string;
}

/**
 * The highest-rated player across both sides — the payload's closest thing to a
 * "player of the match". Null until ratings exist (i.e. before kickoff).
 */
function bestPlayer(
  players: MatchPlayers,
  homeLabel: string,
  awayLabel: string
): BestPlayer | null {
  let best: BestPlayer | null = null;
  let bestRating = -Infinity;
  const consider = (list: PlayerEntry[], teamLabel: string, accent: string) => {
    for (const player of list) {
      if (player.rating == null || player.rating <= bestRating) continue;
      best = { player, teamLabel, accent };
      bestRating = player.rating;
    }
  };
  consider(players.home.players, homeLabel, HOME_COLOR);
  consider(players.away.players, awayLabel, AWAY_COLOR);
  return best;
}

function PlayerOfTheMatch({ best, onPress }: { best: BestPlayer; onPress: () => void }) {
  const { player } = best;
  return (
    <TouchableOpacity
      style={styles.motmCard}
      onPress={onPress}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={`${player.name} stats`}
    >
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
    </TouchableOpacity>
  );
}

function FormationHeader({
  home,
  away,
  homeLabel,
  awayLabel,
}: {
  home: TeamLineup;
  away: TeamLineup;
  homeLabel: string;
  awayLabel: string;
}) {
  return (
    <View style={styles.formationRow}>
      <TeamTag label={homeLabel} formation={home.formation} accent={HOME_COLOR} />
      <TeamTag label={awayLabel} formation={away.formation} accent={AWAY_COLOR} align="right" />
    </View>
  );
}

function TeamTag({
  label,
  formation,
  accent,
  align = 'left',
}: {
  label: string;
  formation?: string;
  accent: string;
  align?: 'left' | 'right';
}) {
  return (
    <View style={[styles.teamTag, align === 'right' && styles.teamTagRight]}>
      <View style={[styles.teamDot, { backgroundColor: accent }]} />
      <Text style={styles.teamTagName} numberOfLines={1}>
        {label}
      </Text>
      {formation ? <Text style={styles.teamTagFormation}>{formation}</Text> : null}
    </View>
  );
}

/**
 * The pitch. Each team's starters are grouped into formation lines (GK → attack).
 * Each goalkeeper sits at their own goal (the outer ends) and the forwards meet
 * in the middle. Home always comes first — top in portrait, left in landscape —
 * matching the header's home-then-away order.
 */
function Pitch({
  home,
  away,
  horizontal,
  homeLabel,
  awayLabel,
  onSelect,
}: {
  home: TeamLineup;
  away: TeamLineup;
  horizontal: boolean;
  homeLabel: string;
  awayLabel: string;
  onSelect: (player: PlayerEntry, label: string, accent: string) => void;
}) {
  const homeRows = formationRows(home); // [GK, …, FWD]
  const awayRows = formationRows(away);

  return (
    <View style={[styles.pitch, horizontal ? styles.pitchHorizontal : styles.pitchVertical]}>
      <PitchMarkings horizontal={horizontal} />
      {/* Home half first: GK first → at the outer edge, forwards toward centre. */}
      <TeamHalf
        rows={homeRows}
        accent={HOME_COLOR}
        horizontal={horizontal}
        onSelect={(player) => onSelect(player, homeLabel, HOME_COLOR)}
      />
      {/* Away half second: rows reversed so the GK lands on the outer far edge. */}
      <TeamHalf
        rows={[...awayRows].reverse()}
        accent={AWAY_COLOR}
        horizontal={horizontal}
        onSelect={(player) => onSelect(player, awayLabel, AWAY_COLOR)}
      />
    </View>
  );
}

function TeamHalf({
  rows,
  accent,
  horizontal,
  onSelect,
}: {
  rows: PlayerEntry[][];
  accent: string;
  horizontal: boolean;
  onSelect: (player: PlayerEntry) => void;
}) {
  return (
    <View style={[styles.half, { flexDirection: horizontal ? 'row' : 'column' }]}>
      {/* The landscape pitch is the portrait one rotated 90° CCW (top → left),
        * so a left→right portrait line must run bottom→top — a plain column
        * would mirror the pitch and swap every player's flank. */}
      {rows.map((line, index) => (
        <View
          key={index}
          style={[styles.line, { flexDirection: horizontal ? 'column-reverse' : 'row' }]}
        >
          {line.map((player) => (
            <PlayerNode
              key={player.id}
              player={player}
              accent={accent}
              onPress={() => onSelect(player)}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

function PlayerNode({
  player,
  accent,
  onPress,
}: {
  player: PlayerEntry;
  accent: string;
  onPress: () => void;
}) {
  // The portrait is layered over the initials, so the accent circle shows while
  // the photo loads and stays put if SofaScore has no headshot for the player.
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <TouchableOpacity
      style={styles.node}
      onPress={onPress}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={`${player.name} stats`}
    >
      <View style={[styles.jersey, { backgroundColor: accent }]}>
        <Text style={styles.jerseyInitials}>{playerInitials(player.name)}</Text>
        {!imageFailed && (
          <Image
            source={{ uri: playerImageUrl(player.id) }}
            style={styles.portrait}
            contentFit="cover"
            transition={120}
            onError={() => setImageFailed(true)}
          />
        )}
        {player.captain && (
          <View style={styles.captainBadge}>
            <Text style={styles.captainText}>C</Text>
          </View>
        )}
        {player.rating != null && (
          <View style={[styles.ratingTag, { backgroundColor: ratingColor(player.rating) }]}>
            <Text style={styles.ratingTagText}>{player.rating.toFixed(1)}</Text>
          </View>
        )}
      </View>
      <View style={styles.nodeLabel}>
        {player.jerseyNumber != null && (
          <Text style={styles.nodeNumber}>{player.jerseyNumber}</Text>
        )}
        <Text style={styles.nodeName} numberOfLines={1}>
          {displayName(player)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function PitchMarkings({ horizontal }: { horizontal: boolean }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={horizontal ? styles.centerLineHorizontal : styles.centerLineVertical} />
      <View style={styles.centerCircle} />
    </View>
  );
}

function Substitutes({
  home,
  away,
  homeLabel,
  awayLabel,
  onSelect,
}: {
  home: TeamLineup;
  away: TeamLineup;
  homeLabel: string;
  awayLabel: string;
  onSelect: (player: PlayerEntry, label: string, accent: string) => void;
}) {
  const homeSubs = home.players.filter((p) => p.substitute);
  const awaySubs = away.players.filter((p) => p.substitute);
  if (!homeSubs.length && !awaySubs.length) return null;

  return (
    <View style={styles.subs}>
      <Text style={styles.subsTitle}>Substitutes</Text>
      <View style={styles.subsColumns}>
        <SubColumn
          label={homeLabel}
          subs={homeSubs}
          accent={HOME_COLOR}
          onSelect={(player) => onSelect(player, homeLabel, HOME_COLOR)}
        />
        <SubColumn
          label={awayLabel}
          subs={awaySubs}
          accent={AWAY_COLOR}
          onSelect={(player) => onSelect(player, awayLabel, AWAY_COLOR)}
        />
      </View>
    </View>
  );
}

function SubColumn({
  label,
  subs,
  accent,
  onSelect,
}: {
  label: string;
  subs: PlayerEntry[];
  accent: string;
  onSelect: (player: PlayerEntry) => void;
}) {
  return (
    <View style={styles.subColumn}>
      <View style={styles.subTeamRow}>
        <View style={[styles.teamDot, { backgroundColor: accent }]} />
        <Text style={styles.subTeamName} numberOfLines={1}>
          {label}
        </Text>
      </View>
      {subs.map((player) => (
        <TouchableOpacity
          key={player.id}
          style={styles.subRow}
          onPress={() => onSelect(player)}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel={`${player.name} stats`}
        >
          <Text style={styles.subNumber}>{player.jerseyNumber ?? '–'}</Text>
          <Text style={styles.subName} numberOfLines={1}>
            {displayName(player)}
          </Text>
          {player.rating != null && <RatingBadge rating={player.rating} size="sm" />}
        </TouchableOpacity>
      ))}
    </View>
  );
}

/** Group a team's starters into formation lines, GK first. Falls back to three
 * even lines when the formation string is missing or doesn't add up. */
function formationRows(lineup: TeamLineup): PlayerEntry[][] {
  const starters = lineup.players.filter((p) => !p.substitute);
  if (!starters.length) return [];

  const gkIndex = starters.findIndex((p) => (p.position ?? '').toUpperCase().startsWith('G'));
  const keeper = gkIndex >= 0 ? starters[gkIndex] : starters[0];
  const outfield = starters.filter((p) => p !== keeper);

  const counts = (lineup.formation ?? '')
    .split('-')
    .map((segment) => parseInt(segment, 10))
    .filter((n) => Number.isFinite(n) && n > 0);

  const rows: PlayerEntry[][] = [[keeper]];
  if (counts.length && counts.reduce((a, b) => a + b, 0) === outfield.length) {
    let offset = 0;
    for (const count of counts) {
      rows.push(outfield.slice(offset, offset + count));
      offset += count;
    }
  } else if (outfield.length) {
    const perRow = Math.ceil(outfield.length / 3);
    for (let i = 0; i < outfield.length; i += perRow) {
      rows.push(outfield.slice(i, i + perRow));
    }
  }
  return rows;
}

function displayName(player: PlayerEntry): string {
  if (player.shortName) return player.shortName;
  const parts = player.name.trim().split(/\s+/);
  return parts[parts.length - 1] || player.name;
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 16,
    paddingBottom: 28,
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
  formationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  teamTag: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  teamTagRight: {
    justifyContent: 'flex-end',
  },
  teamDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  teamTagName: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1,
  },
  teamTagFormation: {
    color: MUTED,
    fontSize: 12,
    fontWeight: '600',
  },
  pitch: {
    width: '100%',
    backgroundColor: PITCH_GREEN,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: LINE_COLOR,
  },
  pitchVertical: {
    aspectRatio: 0.66,
    flexDirection: 'column',
  },
  pitchHorizontal: {
    aspectRatio: 1.85,
    flexDirection: 'row',
  },
  half: {
    flex: 1,
  },
  line: {
    flex: 1,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  node: {
    alignItems: 'center',
    maxWidth: 60,
    paddingHorizontal: 2,
  },
  jersey: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.6)',
  },
  jerseyInitials: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  // Clipped to the circle itself: the jersey keeps its badges overhanging, so
  // it cannot clip its own children.
  portrait: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 17,
  },
  captainBadge: {
    position: 'absolute',
    top: -3,
    left: -3,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FFC800',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captainText: {
    color: '#000000',
    fontSize: 9,
    fontWeight: '800',
  },
  ratingTag: {
    position: 'absolute',
    bottom: -6,
    right: -8,
    minWidth: 22,
    paddingHorizontal: 3,
    height: 14,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingTagText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  nodeLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    marginTop: 5,
    maxWidth: 58,
  },
  nodeNumber: {
    minWidth: 10,
    color: MUTED,
    fontSize: 10,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowRadius: 2,
  },
  nodeName: {
    flexShrink: 1,
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowRadius: 2,
  },
  centerLineVertical: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: LINE_COLOR,
  },
  centerLineHorizontal: {
    position: 'absolute',
    left: '50%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: LINE_COLOR,
  },
  centerCircle: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 64,
    height: 64,
    marginLeft: -32,
    marginTop: -32,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: LINE_COLOR,
  },
  subs: {
    gap: 8,
  },
  subsTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  subsColumns: {
    flexDirection: 'row',
    gap: 16,
  },
  subColumn: {
    flex: 1,
    gap: 4,
  },
  subTeamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  subTeamName: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 1,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 3,
  },
  subNumber: {
    width: 20,
    color: MUTED,
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  subName: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
  },
});
