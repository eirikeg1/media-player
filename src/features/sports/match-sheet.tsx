import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { Image } from 'expo-image';
import type { Fixture } from 'expo-m3u-parser';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFixtureBroadcasts } from './hooks/use-fixture-broadcasts';
import { useLiveMatchScore } from './hooks/use-match-detail';
import { MatchDetailContent } from './match-detail/match-detail-content';
import { MatchOverviewTab } from './match-detail/match-overview-tab';
import { MatchWatchTab } from './match-detail/match-watch-tab';
import { getFixtureScoreDisplay, isMatchConcluded, matchHasStarted, supportsMatchWidgets, type MatchTabKind } from './match-widgets';
import { SPORTS_ACCENT } from './sports-theme';
import type { TeamRef } from './team-sheet';

type SheetTabKey = 'overview' | 'watch' | MatchTabKind;

interface SheetTab {
  key: SheetTabKey;
  label: string;
}

const TABS: SheetTab[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'watch', label: 'Watch' },
  { key: 'stats', label: 'Stats' },
  { key: 'lineups', label: 'Lineups' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'preview', label: 'Form & H2H' },
];

const SHEET_BACKGROUND = '#141417';
const HEADER_BACKGROUND = '#1C1C21';

interface MatchSheetProps {
  fixture: Fixture | null;
  onClose: () => void;
  onPlayChannel: (channelId: string, fixture: Fixture) => void;
  /** Opens the team sheet for a side; the caller closes this sheet first. */
  onOpenTeam: (team: TeamRef) => void;
}

/**
 * Full match sheet: header with live score, a tab strip (facts, channels,
 * stats, lineups, timeline, form) and a one-tap "Watch" button that
 * plays the best-ranked channel from the playlist.
 */
export const MatchSheet = memo(function MatchSheet({ fixture, onClose, onPlayChannel, onOpenTeam }: MatchSheetProps) {
  const insets = useSafeAreaInsets();
  const visible = fixture != null;
  const [tab, setTab] = useState<SheetTabKey>('overview');

  const hasWidgets = supportsMatchWidgets(fixture);

  // Fresh sheet per fixture: lead with Stats once the match is underway — but
  // only for fixtures that actually have the detail tabs.
  useEffect(() => {
    if (fixture) setTab(hasWidgets && matchHasStarted(fixture) ? 'stats' : 'overview');
  }, [fixture?.providerId, hasWidgets]); // eslint-disable-line react-hooks/exhaustive-deps

  const liveScore = useLiveMatchScore(
    hasWidgets ? fixture.providerId : undefined,
    visible && !!fixture && !isMatchConcluded(fixture.status)
  );
  const merged = useMemo<Fixture | null>(() => {
    if (!fixture) return null;
    if (!liveScore) return fixture;
    return {
      ...fixture,
      status: liveScore.status,
      homeScore: liveScore.homeScore ?? fixture.homeScore,
      awayScore: liveScore.awayScore ?? fixture.awayScore,
    };
  }, [fixture, liveScore]);

  const { broadcasts, isLoading: isLoadingBroadcasts } = useFixtureBroadcasts(visible ? fixture : null);
  const bestChannel = broadcasts[0];

  const handlePlay = useCallback(
    (channelId: string) => {
      if (fixture) onPlayChannel(channelId, fixture);
    },
    [fixture, onPlayChannel]
  );

  if (!merged) return null;
  const score = getFixtureScoreDisplay(merged);
  const detailKey: MatchTabKind | null = tab === 'overview' || tab === 'watch' ? null : tab;
  const tabs = hasWidgets ? TABS : TABS.filter((t) => t.key === 'overview' || t.key === 'watch');

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <Text style={styles.competition} numberOfLines={1}>
              {merged.competitionName}
              {merged.competitionCountry ? ` · ${merged.competitionCountry}` : ''}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
              <IconSymbol name="xmark" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <View style={styles.scoreRow}>
            <TeamColumn
              label={score.home}
              crest={merged.homeTeamCrest}
              team={teamRef(merged.homeTeamId, merged.homeTeam, merged.homeTeamCrest)}
              onPress={onOpenTeam}
            />
            <View style={styles.scoreBlock}>
              {score.score ? (
                <Text style={[styles.score, score.isLive && { color: SPORTS_ACCENT.live }]}>{score.score}</Text>
              ) : (
                <Text style={styles.kickoff}>{score.status}</Text>
              )}
              <View style={styles.statusPill}>
                {score.isLive && <View style={styles.liveDot} />}
                <Text style={[styles.statusText, score.isLive && { color: SPORTS_ACCENT.live }]}>
                  {score.score ? score.status : new Date(merged.kickoffTime * 1000).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                </Text>
              </View>
            </View>
            <TeamColumn
              label={score.away}
              crest={merged.awayTeamCrest}
              team={teamRef(merged.awayTeamId, merged.awayTeam, merged.awayTeamCrest)}
              onPress={onOpenTeam}
            />
          </View>

          <TouchableOpacity
            style={[styles.watchButton, !bestChannel && styles.watchButtonDisabled]}
            disabled={!bestChannel}
            onPress={() => bestChannel && handlePlay(bestChannel.channelId)}
            accessibilityRole="button"
            accessibilityLabel={bestChannel ? `Watch on ${bestChannel.tvgName || bestChannel.title}` : 'No channel found'}
          >
            <IconSymbol name="play.fill" size={16} color="#FFFFFF" />
            <Text style={styles.watchText} numberOfLines={1}>
              {isLoadingBroadcasts
                ? 'Finding channels…'
                : bestChannel
                  ? `Watch on ${bestChannel.tvgName || bestChannel.title}`
                  : 'No channel found'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.tabStrip}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabStripContent}>
            {tabs.map((t) => (
              <TouchableOpacity
                key={t.key}
                onPress={() => setTab(t.key)}
                style={[styles.tab, tab === t.key && styles.tabSelected]}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === t.key }}
              >
                <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelSelected]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
          {tab === 'overview' && <MatchOverviewTab fixture={merged} />}
          {tab === 'watch' && (
            <MatchWatchTab broadcasts={broadcasts} isLoading={isLoadingBroadcasts} onPlay={handlePlay} />
          )}
          {hasWidgets && (
            <MatchDetailContent fixture={merged} activeKey={detailKey} homeLabel={score.home} awayLabel={score.away} />
          )}
        </ScrollView>
      </View>
    </Modal>
  );
});

/** The side as the team sheet needs it, or null when the provider gave no id. */
function teamRef(id: number | undefined, name: string, crest?: string): TeamRef | null {
  return id != null ? { id, name, crest } : null;
}

/**
 * One side of the score line. Tappable into the team's upcoming matches
 * whenever the fixture carries a team id — without one there is nothing to
 * look up, so it stays a plain column.
 */
function TeamColumn({
  label,
  crest,
  team,
  onPress,
}: {
  label: string;
  crest?: string;
  team: TeamRef | null;
  onPress: (team: TeamRef) => void;
}) {
  const content = (
    <>
      {crest ? <Image source={{ uri: crest }} style={styles.crest} contentFit="contain" /> : <View style={styles.crest} />}
      <Text style={styles.teamName} numberOfLines={2}>
        {label}
      </Text>
    </>
  );

  if (!team) return <View style={styles.teamColumn}>{content}</View>;

  return (
    <TouchableOpacity
      style={styles.teamColumn}
      onPress={() => onPress(team)}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={`${team.name}, upcoming matches`}
    >
      {content}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SHEET_BACKGROUND,
  },
  header: {
    backgroundColor: HEADER_BACKGROUND,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 14,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  competition: {
    flex: 1,
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '600',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  teamColumn: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  crest: {
    width: 52,
    height: 52,
  },
  teamName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  scoreBlock: {
    alignItems: 'center',
    minWidth: 96,
    gap: 4,
  },
  score: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  kickoff: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: SPORTS_ACCENT.live,
  },
  statusText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '600',
  },
  watchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#34C759',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  watchButtonDisabled: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  watchText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  tabStrip: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  tabStripContent: {
    paddingHorizontal: 12,
    gap: 4,
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabSelected: {
    borderBottomColor: SPORTS_ACCENT.tint,
  },
  tabLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
    fontWeight: '600',
  },
  tabLabelSelected: {
    color: '#FFFFFF',
  },
  body: {
    flex: 1,
  },
});
