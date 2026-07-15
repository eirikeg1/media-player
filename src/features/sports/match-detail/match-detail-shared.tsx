import { Image } from 'expo-image';
import type { PlayerEntry } from 'expo-m3u-parser';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

/**
 * Shared building blocks for the native match-detail tabs. Everything here is
 * rendered on the overlay's dark card, so colours are fixed (not theme-aware)
 * and a single home/away accent pair is reused across every tab for instant
 * visual association.
 */

export const HOME_COLOR = '#4C8DFF';
export const AWAY_COLOR = '#FF8A3D';
export const MUTED = 'rgba(255, 255, 255, 0.55)';
export const FAINT = 'rgba(255, 255, 255, 0.10)';

/** SofaScore-style rating colour ramp (poor → great). */
export function ratingColor(rating: number): string {
  if (rating >= 8) return '#1FB66B';
  if (rating >= 7) return '#7FB335';
  if (rating >= 6.5) return '#C9A227';
  if (rating >= 6) return '#D98324';
  return '#D85A4A';
}

/** Win/Draw/Loss pill colour. */
export function formColor(result: string): string {
  switch (result.toUpperCase()) {
    case 'W':
      return '#1FB66B';
    case 'D':
      return '#8E8E93';
    case 'L':
      return '#D85A4A';
    default:
      return MUTED;
  }
}

export function SectionLoading() {
  return (
    <View style={styles.stateBox}>
      <ActivityIndicator color="#FFFFFF" />
    </View>
  );
}

export function SectionMessage({ text }: { text: string }) {
  return (
    <View style={styles.stateBox}>
      <Text style={styles.stateText}>{text}</Text>
    </View>
  );
}

export function RatingBadge({ rating, size = 'md' }: { rating: number; size?: 'sm' | 'md' }) {
  const small = size === 'sm';
  return (
    <View
      style={[
        styles.ratingBadge,
        small && styles.ratingBadgeSm,
        { backgroundColor: ratingColor(rating) },
      ]}
    >
      <Text style={[styles.ratingText, small && styles.ratingTextSm]}>{rating.toFixed(1)}</Text>
    </View>
  );
}

export function FormPills({ form }: { form: string[] }) {
  if (!form.length) return null;
  return (
    <View style={styles.formRow}>
      {form.map((result, index) => (
        <View
          key={`${result}-${index}`}
          style={[styles.formPill, { backgroundColor: formColor(result) }]}
        >
          <Text style={styles.formPillText}>{result.toUpperCase()}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * A two-sided comparison row: the stat label on top, the raw values on each
 * flank, and a split bar whose fill is proportional to each side's value. The
 * leading side is tinted with its accent colour; a tie stays neutral.
 */
export function ComparisonBar({
  label,
  homeDisplay,
  awayDisplay,
  homeValue,
  awayValue,
  highlight,
}: {
  label: string;
  homeDisplay: string;
  awayDisplay: string;
  homeValue: number;
  awayValue: number;
  highlight: 'home' | 'away' | 'none';
}) {
  const total = homeValue + awayValue;
  // Fall back to an even split when both sides are zero (e.g. 0 shots each).
  const homeFraction = total > 0 ? homeValue / total : 0.5;
  const awayFraction = total > 0 ? awayValue / total : 0.5;

  const homeFill = highlight === 'away' ? FAINT : HOME_COLOR;
  const awayFill = highlight === 'home' ? FAINT : AWAY_COLOR;

  return (
    <View style={styles.comparisonRow}>
      <View style={styles.comparisonValues}>
        <Text style={[styles.comparisonValue, highlight === 'home' && styles.comparisonValueLead]}>
          {homeDisplay}
        </Text>
        <Text style={styles.comparisonLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text
          style={[
            styles.comparisonValue,
            styles.comparisonValueAway,
            highlight === 'away' && styles.comparisonValueLead,
          ]}
        >
          {awayDisplay}
        </Text>
      </View>
      <View style={styles.comparisonTrack}>
        <View style={styles.comparisonTrackHome}>
          <View
            style={[
              styles.comparisonFill,
              { width: `${homeFraction * 100}%`, backgroundColor: homeFill },
            ]}
          />
        </View>
        <View style={styles.comparisonTrackAway}>
          <View
            style={[
              styles.comparisonFill,
              { width: `${awayFraction * 100}%`, backgroundColor: awayFill },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stateBox: {
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  stateText: {
    color: MUTED,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  ratingBadge: {
    minWidth: 34,
    paddingHorizontal: 6,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingBadgeSm: {
    minWidth: 30,
    height: 20,
    borderRadius: 5,
  },
  ratingText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  ratingTextSm: {
    fontSize: 11,
  },
  formRow: {
    flexDirection: 'row',
    gap: 4,
  },
  formPill: {
    width: 20,
    height: 20,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formPillText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  comparisonRow: {
    gap: 6,
  },
  comparisonValues: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  comparisonValue: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    width: 64,
  },
  comparisonValueAway: {
    textAlign: 'right',
  },
  comparisonValueLead: {
    fontWeight: '800',
  },
  comparisonLabel: {
    flex: 1,
    color: MUTED,
    fontSize: 12,
    textAlign: 'center',
  },
  comparisonTrack: {
    flexDirection: 'row',
    gap: 4,
    height: 5,
  },
  // Home half fills from the centre outward to the left; away to the right.
  comparisonTrackHome: {
    flex: 1,
    flexDirection: 'row-reverse',
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: FAINT,
  },
  comparisonTrackAway: {
    flex: 1,
    flexDirection: 'row',
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: FAINT,
  },
  comparisonFill: {
    borderRadius: 3,
  },
});

// =====================================================================
// Player detail (shared by the Lineups pitch and the Players list)
// =====================================================================

/** SofaScore serves square player headshots at this stable path. */
export function playerImageUrl(playerId: number): string {
  return `https://api.sofascore.app/api/v1/player/${playerId}/image`;
}

export interface PlayerStat {
  label: string;
  value: string;
}

/** Build the detailed stat grid for a player, omitting fields with no data. */
export function buildPlayerStats(player: PlayerEntry): PlayerStat[] {
  const stats: PlayerStat[] = [];
  const push = (label: string, value: string | undefined) => {
    if (value != null) stats.push({ label, value });
  };

  if (player.rating != null) push('Rating', player.rating.toFixed(1));
  if (player.minutesPlayed != null) push('Minutes', `${player.minutesPlayed}'`);
  if (player.goals) push('Goals', `${player.goals}`);
  if (player.assists) push('Assists', `${player.assists}`);
  if (player.totalShots != null) {
    push(
      'Shots',
      player.shotsOnTarget != null
        ? `${player.totalShots} (${player.shotsOnTarget})`
        : `${player.totalShots}`
    );
  }
  if (player.totalPasses != null && player.totalPasses > 0) {
    const accurate = player.accuratePasses ?? 0;
    const pct = Math.round((accurate / player.totalPasses) * 100);
    push('Passes', `${pct}% (${accurate}/${player.totalPasses})`);
  }
  if (player.touches != null) push('Touches', `${player.touches}`);
  if (player.duelsWon != null) push('Duels won', `${player.duelsWon}`);
  if (player.tacklesWon != null) push('Tackles', `${player.tacklesWon}`);
  if (player.interceptions != null) push('Interceptions', `${player.interceptions}`);
  if (player.saves != null) push('Saves', `${player.saves}`);
  if (player.goalsPrevented != null) push('Goals prevented', player.goalsPrevented.toFixed(2));
  if (player.expectedGoals != null && player.expectedGoals > 0) {
    push('xG', player.expectedGoals.toFixed(2));
  }
  if (player.expectedAssists != null && player.expectedAssists > 0) {
    push('xA', player.expectedAssists.toFixed(2));
  }
  return stats;
}

/** The wrapping grid of a player's per-match stats, shared by the Players tab's
 * expanding rows and the player sheet. `style` decorates the grid container. */
export function StatGrid({
  stats,
  style,
}: {
  stats: PlayerStat[];
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[gridStyles.grid, style]}>
      {stats.map((stat) => (
        <View key={stat.label} style={gridStyles.cell}>
          <Text style={gridStyles.value}>{stat.value}</Text>
          <Text style={gridStyles.label}>{stat.label}</Text>
        </View>
      ))}
    </View>
  );
}

const gridStyles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  cell: {
    minWidth: 84,
    gap: 2,
  },
  value: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  label: {
    color: MUTED,
    fontSize: 11,
  },
});

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase() || '?';
}

/**
 * A dismissible card with a player's headshot and full per-match stat grid,
 * opened by tapping a player. Rendered as an absolute overlay so it floats above
 * whichever tab opened it (and rotates with the card in portrait).
 */
export function PlayerStatsSheet({
  player,
  teamLabel,
  accent,
  onClose,
}: {
  player: PlayerEntry;
  teamLabel: string;
  accent: string;
  onClose: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const stats = buildPlayerStats(player);
  const meta = [player.position, player.jerseyNumber ? `#${player.jerseyNumber}` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={sheetStyles.overlay}>
      <Pressable style={sheetStyles.backdrop} onPress={onClose} accessibilityLabel="Close player" />
      <View style={sheetStyles.card}>
        <View style={sheetStyles.headerRow}>
          {imageFailed ? (
            <View style={[sheetStyles.avatar, sheetStyles.avatarFallback, { backgroundColor: accent }]}>
              <Text style={sheetStyles.avatarInitials}>{initials(player.name)}</Text>
            </View>
          ) : (
            <Image
              source={{ uri: playerImageUrl(player.id) }}
              style={sheetStyles.avatar}
              contentFit="cover"
              transition={120}
              onError={() => setImageFailed(true)}
            />
          )}
          <View style={sheetStyles.headerInfo}>
            <Text style={sheetStyles.name} numberOfLines={2}>
              {player.name}
              {player.captain ? <Text style={sheetStyles.captain}> (C)</Text> : null}
            </Text>
            <View style={sheetStyles.teamRow}>
              <View style={[sheetStyles.teamDot, { backgroundColor: accent }]} />
              <Text style={sheetStyles.meta} numberOfLines={1}>
                {meta ? `${teamLabel} · ${meta}` : teamLabel}
              </Text>
            </View>
          </View>
          {player.rating != null && <RatingBadge rating={player.rating} />}
          <TouchableOpacity
            style={sheetStyles.close}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={8}
          >
            <Text style={sheetStyles.closeText}>✕</Text>
          </TouchableOpacity>
        </View>

        {stats.length > 0 ? (
          <StatGrid stats={stats} />
        ) : (
          <Text style={sheetStyles.empty}>No match stats for this player yet.</Text>
        )}
      </View>
    </View>
  );
}

const sheetStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    zIndex: 10,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#1C1C20',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    padding: 16,
    gap: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  headerInfo: {
    flex: 1,
    gap: 4,
  },
  name: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  captain: {
    color: MUTED,
    fontSize: 13,
    fontWeight: '700',
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  teamDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  meta: {
    color: MUTED,
    fontSize: 12,
    flexShrink: 1,
  },
  close: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  empty: {
    color: MUTED,
    fontSize: 13,
  },
});
