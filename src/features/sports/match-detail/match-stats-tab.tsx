import type { MatchStatistics, MomentumPoint } from 'expo-m3u-parser';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { MatchSectionState } from '../hooks/use-match-detail';
import { MatchStatsSkeleton } from '../skeletons';
import { ComparisonBar, SectionMessage, StaleNotice, TabScroller } from './match-detail-shared';
import { createThemedStyles, useMatchDetailTheme } from './match-detail-theme';

const MOMENTUM_HEIGHT = 72;

interface StatsTabProps {
  state: MatchSectionState<MatchStatistics>;
  homeLabel: string;
  awayLabel: string;
  /** False when the host already owns a vertical scroller (the match surface). */
  scrollable?: boolean;
}

export const MatchStatsTab = memo(function MatchStatsTab({
  state,
  homeLabel,
  awayLabel,
  scrollable = true,
}: StatsTabProps) {
  const styles = useStyles();
  if (state.isLoading) return <MatchStatsSkeleton />;
  if (state.error) return <SectionMessage text={state.error} />;

  const stats = state.data;
  if (!stats) return <SectionMessage text="No statistics available." />;

  const hasFacts =
    stats.facts.venue || stats.facts.referee || stats.facts.attendance || stats.facts.round;

  return (
    <TabScroller scrollable={scrollable} contentStyle={styles.content}>
      <StaleNotice meta={stats} onRetry={state.refresh} />
      {hasFacts && <MatchFactsStrip facts={stats.facts} />}

      {stats.momentum.length > 0 && (
        <View style={styles.block}>
          <View style={styles.blockHeader}>
            <Text style={styles.blockTitle}>Attack momentum</Text>
            <Legend homeLabel={homeLabel} awayLabel={awayLabel} />
          </View>
          <MomentumGraph points={stats.momentum} />
        </View>
      )}

      {!stats.available ? (
        <SectionMessage text="Live statistics appear once the match kicks off." />
      ) : (
        stats.groups.map((group) => (
          <View key={group.name} style={styles.block}>
            <Text style={styles.blockTitle}>{group.name}</Text>
            <View style={styles.groupItems}>
              {group.items.map((item) => (
                <ComparisonBar
                  key={item.key || item.name}
                  label={item.name}
                  homeDisplay={item.home || '-'}
                  awayDisplay={item.away || '-'}
                  homeValue={item.homeValue}
                  awayValue={item.awayValue}
                  highlight={item.highlight}
                />
              ))}
            </View>
          </View>
        ))
      )}
    </TabScroller>
  );
});

function MatchFactsStrip({ facts }: { facts: MatchStatistics['facts'] }) {
  const styles = useStyles();
  const parts: string[] = [];
  if (facts.round) parts.push(`Round ${facts.round}`);
  if (facts.venue) parts.push(facts.city ? `${facts.venue}, ${facts.city}` : facts.venue);
  if (facts.referee) parts.push(`Ref: ${facts.referee}`);
  if (facts.attendance) parts.push(`${facts.attendance.toLocaleString()} fans`);

  return (
    <View style={styles.factsStrip}>
      <Text style={styles.factsText}>{parts.join('   ·   ')}</Text>
    </View>
  );
}

function Legend({ homeLabel, awayLabel }: { homeLabel: string; awayLabel: string }) {
  const styles = useStyles();
  const theme = useMatchDetailTheme();
  return (
    <View style={styles.legend}>
      <View style={styles.legendItem}>
        <View style={[styles.legendDot, { backgroundColor: theme.homeColor }]} />
        <Text style={styles.legendText} numberOfLines={1}>
          {homeLabel}
        </Text>
      </View>
      <View style={styles.legendItem}>
        <View style={[styles.legendDot, { backgroundColor: theme.awayColor }]} />
        <Text style={styles.legendText} numberOfLines={1}>
          {awayLabel}
        </Text>
      </View>
    </View>
  );
}

/**
 * Attack momentum as a centred bar chart: each minute is a column rising from
 * the midline — upward in the home accent when the home side is pressing,
 * downward in the away accent otherwise. Bar height scales to the busiest
 * minute so the shape of the game reads at a glance.
 */
function MomentumGraph({ points }: { points: MomentumPoint[] }) {
  const styles = useStyles();
  const theme = useMatchDetailTheme();
  const maxAbs = Math.max(1, ...points.map((p) => Math.abs(p.value)));
  const half = MOMENTUM_HEIGHT / 2;

  return (
    <View style={{ height: MOMENTUM_HEIGHT }}>
      <View style={[styles.momentumMidline, { top: half }]} />
      <View style={styles.momentumRow}>
        {points.map((point, index) => {
          const magnitude = (Math.abs(point.value) / maxAbs) * half;
          const isHome = point.value >= 0;
          return (
            <View key={index} style={styles.momentumColumn}>
              <View style={styles.momentumTopHalf}>
                {isHome && (
                  <View
                    style={[styles.momentumBar, { height: magnitude, backgroundColor: theme.homeColor }]}
                  />
                )}
              </View>
              <View style={styles.momentumBottomHalf}>
                {!isHome && (
                  <View
                    style={[styles.momentumBar, { height: magnitude, backgroundColor: theme.awayColor }]}
                  />
                )}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const useStyles = createThemedStyles((theme) => ({
  content: {
    padding: 16,
    gap: 20,
    paddingBottom: 28,
  },
  factsStrip: {
    backgroundColor: theme.faint,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  factsText: {
    color: theme.muted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
  },
  block: {
    gap: 12,
  },
  blockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  blockTitle: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '700',
  },
  groupItems: {
    gap: 14,
  },
  legend: {
    flexDirection: 'row',
    gap: 12,
    flexShrink: 1,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 1,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    color: theme.muted,
    fontSize: 11,
    fontWeight: '600',
    maxWidth: 90,
  },
  momentumMidline: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.border,
  },
  momentumRow: {
    flexDirection: 'row',
    height: MOMENTUM_HEIGHT,
    alignItems: 'stretch',
    gap: 1,
  },
  momentumColumn: {
    flex: 1,
  },
  momentumTopHalf: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  momentumBottomHalf: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  momentumBar: {
    borderRadius: 1,
  },
}));
