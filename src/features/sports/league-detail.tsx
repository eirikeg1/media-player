import { ModalHeader } from '@/components/ui/containers/modal/modal-header';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { useAppState } from '@/hooks/use-app-state';
import { useChromeInsets } from '@/hooks/use-chrome-insets';
import type { LeagueRef, LeagueTab } from '@/lib/route-params';
import { useIsFocused } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { startOfLocalDay } from './date-utils';
import { useDayFixtures } from './hooks/use-day-fixtures';
import { useFavoriteTeams } from './hooks/use-favorite-teams';
import { useLeaguePreferences } from './hooks/use-league-preferences';
import { useLiveTick } from './hooks/use-live-tick';
import { useScorers } from './hooks/use-scorers';
import { useSportsRoutes } from './hooks/use-sports-routes';
import { useStandings } from './hooks/use-standings';
import { groupFixturesByLeague, involvesFavorite } from './match-grouping';
import { MatchRow } from './match-row';
import { ScorersList } from './scorers-list';
import { LeagueMatchesSkeleton } from './skeletons';
import { SPORTS_ACCENT, useSportsPalette } from './sports-theme';
import { StandingsTable } from './standings-table';

const TABS: { key: LeagueTab; label: string }[] = [
  { key: 'matches', label: 'Matches' },
  { key: 'standings', label: 'Table' },
  { key: 'scorers', label: 'Top scorers' },
];

interface LeagueDetailProps {
  /** The competition and the day it was opened from. */
  league: LeagueRef;
  /** Leave the detail surface — the route supplies `router.back()`. */
  onClose: () => void;
}

/**
 * A competition's detail surface: the day's matches, the table and the top
 * scorers.
 *
 * Rendered by `/(detail)/league`, which owns the presentation. The day is read
 * here rather than handed over as a snapshot: the fixtures are re-resolved from
 * the same day view the list uses — cached per day, so reopening one costs no
 * request — and the group is picked out of it by key on every poll, which is
 * what keeps the scores on this surface moving while it is open.
 */
export function LeagueDetail({ league, onClose }: LeagueDetailProps) {
  const insets = useSafeAreaInsets();
  const chromeInsets = useChromeInsets();
  const palette = useSportsPalette();
  const { openMatch } = useSportsRoutes();
  // The surface opens on the tab it was opened from and stays there — including
  // under a match pushed on top of it, which leaves this route mounted.
  const [tab, setTab] = useState<LeagueTab>(league.tab);

  const { teamIds, teamIdSet } = useFavoriteTeams();
  const { order, hideOtherLeagues } = useLeaguePreferences();
  // Polling is for what is on screen: a match pushed over this surface takes
  // the focus with it, and the day view stops until it comes back.
  const isFocused = useIsFocused();
  const appState = useAppState();
  const date = useMemo(() => startOfLocalDay(new Date(league.dateIso)), [league.dateIso]);
  const { fixtures, isLoading } = useDayFixtures(date, teamIds, isFocused && appState === 'active');

  // Grouped the way the list groups it, then picked by key: the group the user
  // pressed is the one this surface follows, whatever the poll changed about
  // its fixtures. The Live filter is not applied — a match that has finished
  // while the surface was open belongs on the competition's day all the same.
  const group = useMemo(
    () =>
      groupFixturesByLeague(fixtures, {
        favoriteTeamIds: teamIdSet,
        leagueOrder: order,
        hideOtherLeagues,
      }).find((candidate) => candidate.key === league.key) ?? null,
    [fixtures, teamIdSet, order, hideOtherLeagues, league.key]
  );
  const dayFixtures = group?.fixtures ?? [];

  // Both sections stay mounted across tab switches — only the fetch is gated —
  // so flipping back to the table shows it instead of reloading it.
  const competitionId = league.competitionId ?? null;
  const standings = useStandings(competitionId, tab === 'standings');
  const scorers = useScorers(competitionId, tab === 'scorers');

  // These are the same rows the day list shows, so their minute has to advance
  // for the same reason (see `useLiveTick`).
  const tick = useLiveTick(tab === 'matches' && (group?.liveCount ?? 0) > 0);

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <ModalHeader title={league.title} onClose={onClose} />
      <View style={styles.hero}>
        {league.logoUrl ? (
          <Image source={{ uri: league.logoUrl }} style={styles.logo} contentFit="contain" />
        ) : null}
        <View>
          <ThemedText style={styles.heroTitle}>{league.title}</ThemedText>
          {league.subtitle ? (
            <ThemedText style={[styles.heroSubtitle, { color: palette.muted }]}>
              {league.subtitle}
            </ThemedText>
          ) : null}
        </View>
      </View>
      <View style={styles.tabs}>
        {TABS.map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            onPress={() => setTab(key)}
            style={[styles.tab, { backgroundColor: tab === key ? SPORTS_ACCENT.tint : palette.faint }]}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === key }}
          >
            <ThemedText style={[styles.tabText, tab === key && styles.tabTextSelected]}>{label}</ThemedText>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + chromeInsets.bottom + 24 },
        ]}
      >
        {tab === 'matches' ? (
          // "Still loading" and "nothing on this day" read the same way in an
          // empty card, so the day says which one it is.
          isLoading && dayFixtures.length === 0 ? (
            <LeagueMatchesSkeleton />
          ) : dayFixtures.length > 0 ? (
            <View style={[styles.matches, { backgroundColor: palette.card }]}>
              {dayFixtures.map((fixture, index) => (
                <MatchRow
                  key={fixture.providerId}
                  fixture={fixture}
                  isFavorite={involvesFavorite(fixture, teamIdSet)}
                  onPress={openMatch}
                  showDivider={index < dayFixtures.length - 1}
                  tick={tick}
                />
              ))}
            </View>
          ) : (
            <View style={styles.empty}>
              <ThemedText style={[styles.emptyText, { color: palette.muted }]}>
                No matches on this day
              </ThemedText>
            </View>
          )
        ) : tab === 'standings' ? (
          <StandingsTable
            standings={standings.standings}
            isLoading={standings.isLoading}
            error={standings.error}
            onRetry={standings.refresh}
            favoriteTeamIds={teamIdSet}
          />
        ) : (
          <ScorersList
            scorers={scorers.scorers}
            isLoading={scorers.isLoading}
            error={scorers.error}
            onRetry={scorers.refresh}
          />
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  logo: {
    width: 40,
    height: 40,
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  heroSubtitle: {
    fontSize: 13,
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextSelected: {
    color: '#FFFFFF',
  },
  content: {
    paddingTop: 8,
  },
  matches: {
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  empty: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
  },
});
