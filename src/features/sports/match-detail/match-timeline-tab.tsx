import type { MatchIncident, MatchTimeline } from 'expo-m3u-parser';
import { memo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { MatchDataState } from '../hooks/use-match-detail';
import { FAINT, MUTED, SectionLoading, SectionMessage } from './match-detail-shared';

interface TimelineTabProps {
  state: MatchDataState<MatchTimeline>;
  /** Landscape: cap the timeline width and centre it so incident rows stay
   * legible instead of stretching the two rails across the full card. */
  compact?: boolean;
}

// Incident types we render; everything else (injury-time notes, etc.) is noise.
const RENDERED = new Set(['goal', 'card', 'substitution', 'varDecision']);

export const MatchTimelineTab = memo(function MatchTimelineTab({
  state,
  compact = false,
}: TimelineTabProps) {
  if (state.isLoading) return <SectionLoading />;
  if (state.error) return <SectionMessage text={state.error} />;

  const timeline = state.data;
  if (!timeline || !timeline.available) {
    return <SectionMessage text="The match timeline appears once play begins." />;
  }

  const incidents = timeline.incidents.filter(
    (incident) => incident.type === 'period' || RENDERED.has(incident.type)
  );
  if (!incidents.length) {
    return <SectionMessage text="No incidents recorded yet." />;
  }

  // Incidents arrive newest-first (the provider passes SofaScore's order
  // through) — the freshest events are what people check for.
  return (
    <ScrollView
      style={styles.fill}
      contentContainerStyle={[styles.content, compact && styles.contentCompact]}
      showsVerticalScrollIndicator={false}
    >
      {incidents.map((incident, index) =>
        incident.type === 'period' ? (
          <PeriodMarker key={`p-${index}`} incident={incident} />
        ) : (
          <IncidentRow key={`i-${index}`} incident={incident} />
        )
      )}
    </ScrollView>
  );
});

function PeriodMarker({ incident }: { incident: MatchIncident }) {
  const score =
    incident.homeScore != null && incident.awayScore != null
      ? `${incident.homeScore} - ${incident.awayScore}`
      : null;
  return (
    <View style={styles.periodRow}>
      <View style={styles.periodLine} />
      <View style={styles.periodChip}>
        <Text style={styles.periodText}>
          {incident.detail ?? 'Period'}
          {score ? `  ${score}` : ''}
        </Text>
      </View>
      <View style={styles.periodLine} />
    </View>
  );
}

function IncidentRow({ incident }: { incident: MatchIncident }) {
  // Home events sit on the right rail, away on the left; unknown defaults left.
  const isHome = incident.isHome === true;
  const content = <IncidentContent incident={incident} align={isHome ? 'right' : 'left'} />;

  return (
    <View style={styles.row}>
      <View style={[styles.side, styles.sideLeft]}>{isHome ? content : null}</View>
      <View style={styles.center}>
        <View style={styles.centerLine} />
        <View style={styles.node}>
          <Text style={styles.nodeIcon}>{incidentGlyph(incident)}</Text>
        </View>
        <Text style={styles.minute}>{formatMinute(incident)}</Text>
      </View>
      <View style={[styles.side, styles.sideRight]}>{!isHome ? content : null}</View>
    </View>
  );
}

function IncidentContent({
  incident,
  align,
}: {
  incident: MatchIncident;
  align: 'left' | 'right';
}) {
  const alignStyle = align === 'right' ? styles.contentRight : styles.contentLeft;

  if (incident.type === 'substitution') {
    return (
      <View style={alignStyle}>
        {incident.player && (
          <Text style={styles.subIn} numberOfLines={1}>
            ↑ {incident.player}
          </Text>
        )}
        {incident.playerOut && (
          <Text style={styles.subOut} numberOfLines={1}>
            ↓ {incident.playerOut}
          </Text>
        )}
      </View>
    );
  }

  const score =
    incident.type === 'goal' && incident.homeScore != null && incident.awayScore != null
      ? `${incident.homeScore}-${incident.awayScore}`
      : null;

  return (
    <View style={alignStyle}>
      <Text style={styles.primaryText} numberOfLines={1}>
        {incident.player ?? incident.detail ?? '—'}
        {score ? <Text style={styles.scoreText}>{`  ${score}`}</Text> : null}
      </Text>
      {incident.assist && (
        <Text style={styles.secondaryText} numberOfLines={1}>
          assist: {incident.assist}
        </Text>
      )}
      {incident.type === 'goal' && incident.detail && incident.detail !== 'regular' && (
        <Text style={styles.secondaryText}>{goalDetailLabel(incident.detail)}</Text>
      )}
      {incident.type === 'card' && incident.detail === 'yellowRed' && (
        <Text style={styles.secondaryText}>(second yellow)</Text>
      )}
    </View>
  );
}

function incidentGlyph(incident: MatchIncident): string {
  switch (incident.type) {
    case 'goal':
      return '⚽';
    case 'card':
      return cardGlyph(incident.detail);
    case 'substitution':
      return '⇄';
    case 'varDecision':
      return 'VAR';
    default:
      return '•';
  }
}

function cardGlyph(detail?: string): string {
  // Coloured squares render distinctly on the dark card without an icon font.
  // A second yellow shows the red it results in; the row text carries the
  // "(second yellow)" detail.
  return detail === 'red' || detail === 'yellowRed' ? '🟥' : '🟨';
}

function goalDetailLabel(detail: string): string {
  switch (detail) {
    case 'penalty':
      return '(penalty)';
    case 'ownGoal':
      return '(own goal)';
    default:
      return `(${detail})`;
  }
}

function formatMinute(incident: MatchIncident): string {
  if (incident.time == null) return '';
  return incident.addedTime ? `${incident.time}+${incident.addedTime}'` : `${incident.time}'`;
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 28,
  },
  contentCompact: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 52,
  },
  side: {
    flex: 1,
    justifyContent: 'center',
  },
  sideLeft: {
    alignItems: 'flex-end',
    paddingRight: 10,
  },
  sideRight: {
    alignItems: 'flex-start',
    paddingLeft: 10,
  },
  center: {
    width: 56,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 4,
  },
  centerLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: FAINT,
  },
  node: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1F1F24',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeIcon: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  minute: {
    marginTop: 3,
    color: MUTED,
    fontSize: 11,
    fontWeight: '600',
  },
  contentLeft: {
    alignItems: 'flex-start',
  },
  contentRight: {
    alignItems: 'flex-end',
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  scoreText: {
    color: '#1FB66B',
    fontWeight: '800',
  },
  secondaryText: {
    color: MUTED,
    fontSize: 12,
    marginTop: 1,
  },
  subIn: {
    color: '#1FB66B',
    fontSize: 13,
    fontWeight: '600',
  },
  subOut: {
    color: '#D85A4A',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 1,
  },
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  periodLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: FAINT,
  },
  periodChip: {
    backgroundColor: FAINT,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  periodText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
