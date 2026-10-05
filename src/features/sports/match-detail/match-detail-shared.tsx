import { formatTime } from '@/lib/format-time';
import { Image } from 'expo-image';
import type { MatchDetailMeta, PlayerEntry } from 'expo-m3u-parser';
import { useState, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { createThemedStyles, useMatchDetailTheme } from './match-detail-theme';

/**
 * Shared building blocks for the native match-detail tabs. Their colours come
 * from the surface the host provides (see `match-detail-theme`), so the same
 * block reads on the player overlay's dark card and on the themed match route.
 */

/** SofaScore-style rating colour ramp (poor → great). */
export function ratingColor(rating: number): string {
  if (rating >= 8) return '#1FB66B';
  if (rating >= 7) return '#7FB335';
  if (rating >= 6.5) return '#C9A227';
  if (rating >= 6) return '#D98324';
  return '#D85A4A';
}

/**
 * Win/Draw/Loss pill colour. Fixed rather than themed: the letter is written in
 * white on the pill, so the pill has to carry the contrast on either surface.
 */
export function formColor(result: string): string {
  switch (result.toUpperCase()) {
    case 'W':
      return '#1FB66B';
    case 'L':
      return '#D85A4A';
    // A draw, and any letter the provider sends that is none of the three.
    default:
      return '#8E8E93';
  }
}

/**
 * A tab body's scroll container.
 *
 * The tabs are hosted in two places. The player overlay gives them a
 * fixed-height card and expects each to scroll itself; the match surface is one
 * long scrolling page and owns the only scroller. Nesting two vertical
 * scrollers inside one another makes the inner one swallow the gesture and
 * collapses it to a single screenful, so when the host already scrolls this
 * lays the content out as a plain view and lets the page grow.
 */
export function TabScroller({
  scrollable,
  contentStyle,
  children,
}: {
  scrollable: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const styles = useStyles();
  if (!scrollable) return <View style={contentStyle}>{children}</View>;
  return (
    <ScrollView
      style={styles.tabFill}
      contentContainerStyle={contentStyle}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

/**
 * "as of 20:41 · Retry" — what a section shows when the native side answered it
 * from cache because the provider refused.
 *
 * The payload underneath is real, just old, so this is a line above it rather
 * than an error state: hiding a whole half's statistics because the last
 * refresh failed would be a worse answer than the ones from a minute ago. It
 * gates itself on `meta.stale` so every tab renders it the same single way.
 */
export function StaleNotice({
  meta,
  onRetry,
}: {
  meta: MatchDetailMeta | undefined;
  onRetry: () => void;
}) {
  const styles = useStyles();
  if (!meta?.stale) return null;
  // A section the provider has never answered has no time to name; saying so
  // beats dressing the epoch up as a fetch at 01:00.
  const asOf = meta.fetchedAt > 0 ? `as of ${formatTime(meta.fetchedAt)}` : 'not up to date';

  return (
    <View style={styles.staleRow}>
      <Text style={styles.staleText}>{asOf}</Text>
      <Text style={styles.staleText}>·</Text>
      <TouchableOpacity
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Retry loading this section"
        hitSlop={8}
      >
        <Text style={styles.staleRetry}>Retry</Text>
      </TouchableOpacity>
    </View>
  );
}

export function SectionMessage({ text }: { text: string }) {
  const styles = useStyles();
  return (
    <View style={styles.stateBox}>
      <Text style={styles.stateText}>{text}</Text>
    </View>
  );
}

export function RatingBadge({ rating, size = 'md' }: { rating: number; size?: 'sm' | 'md' }) {
  const styles = useStyles();
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
  const styles = useStyles();
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
  const styles = useStyles();
  const theme = useMatchDetailTheme();
  const total = homeValue + awayValue;
  // Fall back to an even split when both sides are zero (e.g. 0 shots each).
  const homeFraction = total > 0 ? homeValue / total : 0.5;
  const awayFraction = total > 0 ? awayValue / total : 0.5;

  const homeFill = highlight === 'away' ? theme.faint : theme.homeColor;
  const awayFill = highlight === 'home' ? theme.faint : theme.awayColor;

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

const useStyles = createThemedStyles((theme) => ({
  staleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  staleText: {
    color: theme.muted,
    fontSize: 11,
  },
  staleRetry: {
    color: theme.text,
    fontSize: 11,
    fontWeight: '700',
  },
  stateBox: {
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  stateText: {
    color: theme.muted,
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
    color: theme.text,
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
    color: theme.text,
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
    color: theme.text,
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
    color: theme.muted,
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
    backgroundColor: theme.faint,
  },
  comparisonTrackAway: {
    flex: 1,
    flexDirection: 'row',
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: theme.faint,
  },
  comparisonFill: {
    borderRadius: 3,
  },
  tabFill: {
    flex: 1,
  },
}));

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
  const gridStyles = useGridStyles();
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

const useGridStyles = createThemedStyles((theme) => ({
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
    color: theme.text,
    fontSize: 15,
    fontWeight: '700',
  },
  label: {
    color: theme.muted,
    fontSize: 11,
  },
}));

/** Two-letter fallback shown while (or instead of) a player's portrait. */
export function playerInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase() || '?';
}

/**
 * How the player card is placed over its host.
 *
 * - `overlay`: absolutely filling the tab. Right for the player overlay, whose
 *   card has a fixed height and is counter-rotated in portrait — the card has to
 *   rotate with it.
 * - `modal`: a screen-level modal. Right for the match surface, where the tab is
 *   a section of one long scrolling page: an absolute overlay there is measured
 *   against the whole scroll content, so it lands wherever the page happens to
 *   be scrolled rather than in front of the reader.
 */
export type PlayerSheetPresentation = 'overlay' | 'modal';

/**
 * A dismissible card with a player's headshot and full per-match stat grid,
 * opened by tapping a player.
 */
export function PlayerStatsSheet({
  player,
  teamLabel,
  accent,
  presentation = 'overlay',
  onClose,
}: {
  player: PlayerEntry;
  teamLabel: string;
  accent: string;
  presentation?: PlayerSheetPresentation;
  onClose: () => void;
}) {
  const sheetStyles = useSheetStyles();
  const [imageFailed, setImageFailed] = useState(false);
  const stats = buildPlayerStats(player);
  // The shirt number leads the name (like every other player row), so the meta
  // line carries only the position.
  const meta = player.position ?? '';

  const card = (
    <View style={sheetStyles.overlay}>
      <Pressable style={sheetStyles.backdrop} onPress={onClose} accessibilityLabel="Close player" />
      <View style={sheetStyles.card}>
        <View style={sheetStyles.headerRow}>
          {imageFailed ? (
            <View style={[sheetStyles.avatar, sheetStyles.avatarFallback, { backgroundColor: accent }]}>
              <Text style={sheetStyles.avatarInitials}>{playerInitials(player.name)}</Text>
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
            <View style={sheetStyles.nameRow}>
              {player.jerseyNumber != null && (
                <Text style={sheetStyles.shirtNumber}>{player.jerseyNumber}</Text>
              )}
              <Text style={sheetStyles.name} numberOfLines={2}>
                {player.name}
                {player.captain ? <Text style={sheetStyles.captain}> (C)</Text> : null}
              </Text>
            </View>
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

  if (presentation === 'overlay') return card;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      {card}
    </Modal>
  );
}

const useSheetStyles = createThemedStyles((theme) => ({
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
    backgroundColor: theme.card,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
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
    backgroundColor: theme.faint,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color: theme.text,
    fontSize: 18,
    fontWeight: '800',
  },
  headerInfo: {
    flex: 1,
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  shirtNumber: {
    minWidth: 20,
    color: theme.muted,
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  name: {
    flexShrink: 1,
    color: theme.text,
    fontSize: 16,
    fontWeight: '700',
  },
  captain: {
    color: theme.muted,
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
    color: theme.muted,
    fontSize: 12,
    flexShrink: 1,
  },
  close: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: theme.faint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: theme.text,
    fontSize: 13,
    fontWeight: '700',
  },
  empty: {
    color: theme.muted,
    fontSize: 13,
  },
}));
