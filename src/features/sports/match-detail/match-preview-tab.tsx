import type { H2H, MatchPreview, TeamForm } from 'expo-m3u-parser';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { MatchSectionState } from '../hooks/use-match-detail';
import { MatchPreviewSkeleton } from '../skeletons';
import { FormPills, SectionMessage, StaleNotice, TabScroller } from './match-detail-shared';
import { createThemedStyles, useMatchDetailTheme } from './match-detail-theme';

interface PreviewTabProps {
  state: MatchSectionState<MatchPreview>;
  homeLabel: string;
  awayLabel: string;
  /** False when the host already owns a vertical scroller (the match surface). */
  scrollable?: boolean;
}

export const MatchPreviewTab = memo(function MatchPreviewTab({
  state,
  homeLabel,
  awayLabel,
  scrollable = true,
}: PreviewTabProps) {
  const styles = useStyles();
  const theme = useMatchDetailTheme();
  if (state.isLoading) return <MatchPreviewSkeleton />;
  if (state.error) return <SectionMessage text={state.error} />;

  const preview = state.data;
  if (!preview || !preview.available) {
    return <SectionMessage text="No preview data available for this match." />;
  }

  return (
    <TabScroller scrollable={scrollable} contentStyle={styles.content}>
      <StaleNotice meta={preview} onRetry={state.refresh} />
      {preview.h2h && (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Head to head</Text>
          <HeadToHead h2h={preview.h2h} homeLabel={homeLabel} awayLabel={awayLabel} />
        </View>
      )}

      {(preview.homeForm || preview.awayForm) && (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Recent form</Text>
          <View style={styles.formColumns}>
            <FormColumn label={homeLabel} form={preview.homeForm} accent={theme.homeColor} />
            <View style={styles.formDivider} />
            <FormColumn label={awayLabel} form={preview.awayForm} accent={theme.awayColor} align="right" />
          </View>
        </View>
      )}
    </TabScroller>
  );
});

function HeadToHead({
  h2h,
  homeLabel,
  awayLabel,
}: {
  h2h: H2H;
  homeLabel: string;
  awayLabel: string;
}) {
  const styles = useStyles();
  const theme = useMatchDetailTheme();
  const total = Math.max(1, h2h.homeWins + h2h.draws + h2h.awayWins);
  return (
    <View style={styles.h2hCard}>
      <View style={styles.h2hCounts}>
        <H2HCount value={h2h.homeWins} label="Wins" align="left" color={theme.homeColor} />
        <H2HCount value={h2h.draws} label="Draws" align="center" color={theme.muted} />
        <H2HCount value={h2h.awayWins} label="Wins" align="right" color={theme.awayColor} />
      </View>
      <View style={styles.h2hBar}>
        <View style={{ flex: h2h.homeWins / total, backgroundColor: theme.homeColor }} />
        <View style={{ flex: h2h.draws / total, backgroundColor: theme.muted }} />
        <View style={{ flex: h2h.awayWins / total, backgroundColor: theme.awayColor }} />
      </View>
      <View style={styles.h2hTeams}>
        <Text style={styles.h2hTeam} numberOfLines={1}>
          {homeLabel}
        </Text>
        <Text style={[styles.h2hTeam, styles.h2hTeamRight]} numberOfLines={1}>
          {awayLabel}
        </Text>
      </View>
    </View>
  );
}

function H2HCount({
  value,
  label,
  align,
  color,
}: {
  value: number;
  label: string;
  align: 'left' | 'center' | 'right';
  color: string;
}) {
  const styles = useStyles();
  return (
    <View style={[styles.h2hCount, { alignItems: alignItems(align) }]}>
      <Text style={[styles.h2hValue, { color }]}>{value}</Text>
      <Text style={styles.h2hLabel}>{label}</Text>
    </View>
  );
}

function FormColumn({
  label,
  form,
  accent,
  align = 'left',
}: {
  label: string;
  form?: TeamForm | null;
  accent: string;
  align?: 'left' | 'right';
}) {
  const styles = useStyles();
  const itemsAlign = alignItems(align);
  return (
    <View style={[styles.formColumn, { alignItems: itemsAlign }]}>
      <View style={styles.formTeamRow}>
        <View style={[styles.teamDot, { backgroundColor: accent }]} />
        <Text style={styles.formTeamName} numberOfLines={1}>
          {label}
        </Text>
      </View>
      {form ? (
        <>
          <FormPills form={form.form.slice(0, 5)} />
          <View style={[styles.formMeta, { alignItems: itemsAlign }]}>
            {form.position != null && (
              <Text style={styles.formMetaText}>League position: {form.position}</Text>
            )}
            {form.avgRating != null && (
              <Text style={styles.formMetaText}>Avg rating: {form.avgRating.toFixed(2)}</Text>
            )}
          </View>
        </>
      ) : (
        <Text style={styles.formMetaText}>No recent form</Text>
      )}
    </View>
  );
}

function alignItems(align: 'left' | 'center' | 'right') {
  if (align === 'right') return 'flex-end';
  if (align === 'center') return 'center';
  return 'flex-start';
}

const useStyles = createThemedStyles((theme) => ({
  content: {
    padding: 16,
    gap: 22,
    paddingBottom: 28,
  },
  block: {
    gap: 12,
  },
  blockTitle: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '700',
  },
  h2hCard: {
    gap: 10,
  },
  h2hCounts: {
    flexDirection: 'row',
  },
  h2hCount: {
    flex: 1,
    gap: 2,
  },
  h2hValue: {
    fontSize: 26,
    fontWeight: '800',
  },
  h2hLabel: {
    color: theme.muted,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  h2hBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: theme.faint,
  },
  h2hTeams: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  h2hTeam: {
    flex: 1,
    color: theme.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  h2hTeamRight: {
    textAlign: 'right',
  },
  formColumns: {
    flexDirection: 'row',
    gap: 12,
  },
  formColumn: {
    flex: 1,
    gap: 10,
  },
  formDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: theme.border,
  },
  formTeamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  teamDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  formTeamName: {
    color: theme.text,
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1,
  },
  formMeta: {
    gap: 3,
  },
  formMetaText: {
    color: theme.muted,
    fontSize: 12,
  },
}));
