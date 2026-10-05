import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { useChromeInsets } from '@/hooks/use-chrome-insets';
import { hrefParam, type TeamRef } from '@/lib/route-params';
import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import { Image } from 'expo-image';
import type { Fixture } from 'expo-m3u-parser';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { CatchupWindow } from '../catchup';
import { fixtureRouteParam } from '../fixture-param';
import { useFixtureBroadcasts } from '../hooks/use-fixture-broadcasts';
import { useLiveTick } from '../hooks/use-live-tick';
import { useLiveMatchScore } from '../hooks/use-match-detail';
import { matchHref, useSportsRoutes } from '../hooks/use-sports-routes';
import { mergeLiveScore } from '../live-score';
import {
  getFixtureScoreDisplay,
  isMatchConcluded,
  isMatchLive,
  matchHasStarted,
  supportsMatchWidgets,
  type MatchTabKind,
} from '../match-widgets';
import { SPORTS_ACCENT, useSportsPalette } from '../sports-theme';
import { MatchDetailContent } from './match-detail-content';
import { MatchDetailThemeProvider, useThemedMatchDetailTheme } from './match-detail-theme';
import { MatchOverviewTab } from './match-overview-tab';
import { MatchWatchTab } from './match-watch-tab';

type DetailTabKey = 'overview' | 'watch' | MatchTabKind;

interface DetailTab {
  key: DetailTabKey;
  label: string;
}

const TABS: DetailTab[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'watch', label: 'Watch' },
  { key: 'stats', label: 'Stats' },
  { key: 'lineups', label: 'Lineups' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'preview', label: 'Form & H2H' },
];

interface MatchDetailProps {
  /**
   * The match, as the list that opened it held it. Only its static half is read
   * from here — the score and the minute are re-resolved below, so a surface
   * left open follows the match rather than the moment it was tapped.
   */
  fixture: Fixture;
  /** Leave the detail surface — the route supplies `router.back()`. */
  onClose: () => void;
}

/**
 * Everything a match's detail surface shows: the live score, a tab strip
 * (facts, channels, stats, lineups, timeline, form) and a one-tap "Watch"
 * button that plays the best-ranked channel from the playlist.
 *
 * Rendered by `/(detail)/match`, which owns the presentation; this component
 * owns the content and the steps that follow it — a side's upcoming matches,
 * and the player — pushing both itself so that backing out of either returns
 * here rather than to the day list.
 */
export function MatchDetail({ fixture, onClose }: MatchDetailProps) {
  const insets = useSafeAreaInsets();
  const chromeInsets = useChromeInsets();
  const palette = useSportsPalette();
  const detailTheme = useThemedMatchDetailTheme();
  const router = useRouter();
  const { openTeam } = useSportsRoutes();
  const activePlaylistId = usePlaylistStore((s) => s.activePlaylistId);

  const hasWidgets = supportsMatchWidgets(fixture);
  // The surface is pushed anew per match, so where it opens is decided once:
  // lead with Stats for a match that is underway — but only where the detail
  // tabs exist at all. Switching tabs from there is the user's business, and it
  // survives a push on top of this route because the route stays mounted.
  const [tab, setTab] = useState<DetailTabKey>(() =>
    hasWidgets && matchHasStarted(fixture) ? 'stats' : 'overview'
  );

  const liveScore = useLiveMatchScore(
    hasWidgets ? fixture.providerId : undefined,
    !isMatchConcluded(fixture)
  );
  const merged = useMemo(() => mergeLiveScore(fixture, liveScore), [fixture, liveScore]);

  const {
    broadcasts,
    isLoading: isLoadingBroadcasts,
    error: broadcastsError,
    retry: retryBroadcasts,
  } = useFixtureBroadcasts(fixture);
  const bestChannel = broadcasts[0];

  const handlePlay = useCallback(
    (channelId: string, catchup: CatchupWindow | null = null) => {
      // No queue is staged: a match is a single stream, and startSession clears
      // whatever the previous session was navigating.
      router.push({
        pathname: '/video-player',
        params: {
          channelId,
          playlistId: activePlaylistId ?? '',
          contentType: 'live',
          // Carry the match so the player can show SofaScore match widgets.
          fixture: fixtureRouteParam(merged),
          // Remembered by the session, so expanding the mini bar later puts this
          // surface back underneath the player.
          origin: hrefParam.encode(matchHref(merged)),
          // Present, the window makes the player play the panel's archive.
          ...(catchup
            ? {
                catchupStart: String(catchup.start),
                catchupDuration: String(catchup.durationMinutes),
              }
            : {}),
        },
      });
    },
    [router, activePlaylistId, merged]
  );

  // The header minute is read from the device clock, so time has to be an input
  // for it to advance; the score poll alone only lands once a minute and only
  // when something actually changed.
  const tick = useLiveTick(isMatchLive(merged));
  const score = useMemo(
    () => getFixtureScoreDisplay(merged, new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `tick` is the clock
    [merged, tick]
  );

  const detailKey: MatchTabKind | null = tab === 'overview' || tab === 'watch' ? null : tab;
  const tabs = hasWidgets ? TABS : TABS.filter((t) => t.key === 'overview' || t.key === 'watch');

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: palette.background }]}>
      <View style={[styles.header, { backgroundColor: palette.card }]}>
        <View style={styles.headerTop}>
          <Text style={[styles.competition, { color: palette.muted }]} numberOfLines={1}>
            {merged.competitionName}
            {merged.competitionCountry ? ` · ${merged.competitionCountry}` : ''}
          </Text>
          <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
            <IconSymbol name="xmark" size={20} color={palette.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.scoreRow}>
          <TeamColumn
            label={score.home}
            crest={merged.homeTeamCrest}
            team={teamRef(merged, merged.homeTeamId, merged.homeTeam, merged.homeTeamCrest)}
            onPress={openTeam}
            textColor={palette.text}
          />
          <View style={styles.scoreBlock}>
            {score.score ? (
              <Text style={[styles.score, { color: palette.text }, score.isLive && { color: SPORTS_ACCENT.live }]}>
                {score.score}
              </Text>
            ) : (
              <Text style={[styles.kickoff, { color: palette.text }]}>{score.status}</Text>
            )}
            <View style={styles.statusPill}>
              {score.isLive && <View style={styles.liveDot} />}
              <Text style={[styles.statusText, { color: palette.muted }, score.isLive && { color: SPORTS_ACCENT.live }]}>
                {score.score ? score.status : new Date(merged.kickoffTime * 1000).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
              </Text>
            </View>
          </View>
          <TeamColumn
            label={score.away}
            crest={merged.awayTeamCrest}
            team={teamRef(merged, merged.awayTeamId, merged.awayTeam, merged.awayTeamCrest)}
            onPress={openTeam}
            textColor={palette.text}
          />
        </View>

        <TouchableOpacity
          style={[styles.watchButton, !bestChannel && { backgroundColor: palette.faint }]}
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
                : broadcastsError
                  ? "Couldn't find channels"
                  : 'No channel found'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.tabStrip, { borderBottomColor: palette.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabStripContent}>
          {tabs.map((t) => (
            <TouchableOpacity
              key={t.key}
              onPress={() => setTab(t.key)}
              style={[styles.tab, tab === t.key && styles.tabSelected]}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t.key }}
            >
              <Text
                style={[
                  styles.tabLabel,
                  { color: tab === t.key ? palette.text : palette.muted },
                ]}
              >
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* The surface owns the only vertical scroller; the detail tabs lay their
          content out flat (`scrollable={false}`) so nothing nests inside it.
          The body is the themed surface the tabs draw on, so it matches the
          chrome above instead of showing a dark slab under a light header. */}
      <MatchDetailThemeProvider value={detailTheme}>
        <ScrollView
          testID="match-detail-body"
          style={[styles.body, { backgroundColor: detailTheme.background }]}
          contentContainerStyle={{ paddingBottom: insets.bottom + chromeInsets.bottom + 32 }}
        >
          {tab === 'overview' && <MatchOverviewTab fixture={merged} />}
          {tab === 'watch' && (
            <MatchWatchTab
              fixture={merged}
              broadcasts={broadcasts}
              isLoading={isLoadingBroadcasts}
              error={broadcastsError}
              onRetry={retryBroadcasts}
              onPlay={handlePlay}
            />
          )}
          {hasWidgets && (
            <MatchDetailContent
              fixture={merged}
              activeKey={detailKey}
              homeLabel={score.home}
              awayLabel={score.away}
              scrollable={false}
            />
          )}
        </ScrollView>
      </MatchDetailThemeProvider>
    </View>
  );
}

/** The side as the team route needs it, or null when the provider gave no id. */
function teamRef(
  fixture: Fixture,
  id: number | null | undefined,
  name: string,
  crest?: string | null
): TeamRef | null {
  return id != null ? { provider: fixture.provider, providerId: id, name, crest } : null;
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
  textColor,
}: {
  label: string;
  crest?: string | null;
  team: TeamRef | null;
  onPress: (team: TeamRef) => void;
  textColor: string;
}) {
  const content = (
    <>
      {crest ? <Image source={{ uri: crest }} style={styles.crest} contentFit="contain" /> : <View style={styles.crest} />}
      <Text style={[styles.teamName, { color: textColor }]} numberOfLines={2}>
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
  },
  header: {
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
    fontSize: 36,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  kickoff: {
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
  watchText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  tabStrip: {
    borderBottomWidth: StyleSheet.hairlineWidth,
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
    fontSize: 14,
    fontWeight: '600',
  },
  body: {
    flex: 1,
  },
});
