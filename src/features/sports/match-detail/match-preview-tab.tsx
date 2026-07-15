import type { H2H, MatchPreview, TeamForm } from 'expo-m3u-parser';
import { memo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { MatchDataState } from '../hooks/use-match-detail';
import {
  AWAY_COLOR,
  FAINT,
  FormPills,
  HOME_COLOR,
  MUTED,
  SectionLoading,
  SectionMessage,
} from './match-detail-shared';

interface PreviewTabProps {
  state: MatchDataState<MatchPreview>;
  homeLabel: string;
  awayLabel: string;
}

export const MatchPreviewTab = memo(function MatchPreviewTab({
  state,
  homeLabel,
  awayLabel,
}: PreviewTabProps) {
  if (state.isLoading) return <SectionLoading />;
  if (state.error) return <SectionMessage text={state.error} />;

  const preview = state.data;
  if (!preview || !preview.available) {
    return <SectionMessage text="No preview data available for this match." />;
  }

  return (
    <ScrollView style={styles.fill} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
            <FormColumn label={homeLabel} form={preview.homeForm} accent={HOME_COLOR} />
            <View style={styles.formDivider} />
            <FormColumn label={awayLabel} form={preview.awayForm} accent={AWAY_COLOR} align="right" />
          </View>
        </View>
      )}
    </ScrollView>
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
  const total = Math.max(1, h2h.homeWins + h2h.draws + h2h.awayWins);
  return (
    <View style={styles.h2hCard}>
      <View style={styles.h2hCounts}>
        <H2HCount value={h2h.homeWins} label="Wins" align="left" color={HOME_COLOR} />
        <H2HCount value={h2h.draws} label="Draws" align="center" color={MUTED} />
        <H2HCount value={h2h.awayWins} label="Wins" align="right" color={AWAY_COLOR} />
      </View>
      <View style={styles.h2hBar}>
        <View style={{ flex: h2h.homeWins / total, backgroundColor: HOME_COLOR }} />
        <View style={{ flex: h2h.draws / total, backgroundColor: 'rgba(255,255,255,0.25)' }} />
        <View style={{ flex: h2h.awayWins / total, backgroundColor: AWAY_COLOR }} />
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
  form?: TeamForm;
  accent: string;
  align?: 'left' | 'right';
}) {
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

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 22,
    paddingBottom: 28,
  },
  block: {
    gap: 12,
  },
  blockTitle: {
    color: '#FFFFFF',
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
    color: MUTED,
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
    backgroundColor: FAINT,
  },
  h2hTeams: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  h2hTeam: {
    flex: 1,
    color: MUTED,
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
    backgroundColor: FAINT,
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
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1,
  },
  formMeta: {
    gap: 3,
  },
  formMetaText: {
    color: MUTED,
    fontSize: 12,
  },
});
