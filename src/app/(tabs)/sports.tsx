import { invalidateSportsCaches } from '@/features/sports/cache-invalidation';
import { useDayFixtures } from '@/features/sports/hooks/use-day-fixtures';
import { useFavoriteMatchPrefetch } from '@/features/sports/hooks/use-favorite-match-prefetch';
import { useFavoriteTeams } from '@/features/sports/hooks/use-favorite-teams';
import { useLeaguePreferences } from '@/features/sports/hooks/use-league-preferences';
import { useSportsRoutes } from '@/features/sports/hooks/use-sports-routes';
import { groupFixturesByLeague, type MatchGroup } from '@/features/sports/match-grouping';
import { isMatchLive } from '@/features/sports/match-widgets';
import { MatchesList } from '@/features/sports/matches-list';
import { SportsHeader, type MatchFilter } from '@/features/sports/sports-header';
import { isSameLocalDay, startOfLocalDay } from '@/features/sports/date-utils';
import { ManageFavoritesModal } from '@/features/sports/team-search-modal';
import { useToday } from '@/features/sports/hooks/use-today';
import { useAppState } from '@/hooks/use-app-state';
import { useChromeInsets } from '@/hooks/use-chrome-insets';
import type { LeagueTab } from '@/lib/route-params';
import { getSportsDatabase } from '@/services/sports-service';
import { useIsFocused } from '@react-navigation/native';
import type { Team } from 'expo-m3u-parser';
import { useCallback, useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SportsScreen() {
  const insets = useSafeAreaInsets();
  // The tab bar and mini player float over the screen, so the list has to
  // reserve their height itself.
  const chromeInsets = useChromeInsets();
  // A match, a competition and a team are routes of their own: pressing one is
  // a navigation, carrying what it is about in the parameters. That is what
  // keeps this list mounted behind them, and what puts the player they lead to
  // above them in history instead of in their place.
  const { openMatch, openLeague } = useSportsRoutes();
  // Tabs stay mounted once visited, so "is this screen on show" has to be asked
  // rather than assumed: the day view polls only while it is.
  const isFocused = useIsFocused();
  const appState = useAppState();
  const isActive = isFocused && appState === 'active';

  const [selectedDate, setSelectedDate] = useState(() => startOfLocalDay(new Date()));
  const [filter, setFilter] = useState<MatchFilter>('all');
  const [favoritesVisible, setFavoritesVisible] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const {
    teams,
    teamIds,
    teamIdSet: favoriteTeamIds,
    isLoading: isLoadingTeams,
    addTeam,
    removeTeam,
    refresh: refreshTeams,
  } = useFavoriteTeams();
  const { order, hideOtherLeagues } = useLeaguePreferences();
  const { fixtures, isLoading, isRevalidating, error, refresh } = useDayFixtures(
    selectedDate,
    teamIds,
    isActive
  );

  const liveCount = useMemo(() => fixtures.filter(isMatchLive).length, [fixtures]);
  const groups = useMemo(
    () =>
      groupFixturesByLeague(fixtures, {
        favoriteTeamIds,
        leagueOrder: order,
        hideOtherLeagues,
        liveOnly: filter === 'live',
      }),
    [fixtures, favoriteTeamIds, order, hideOtherLeagues, filter]
  );
  const today = useToday();
  const isToday = isSameLocalDay(selectedDate, today);

  // Held back until the day list has settled: the warm requests are paced by
  // the provider and would otherwise queue ahead of the list's own fetch. Rows
  // served from a cache that is still being refreshed are not settled yet —
  // that fan-out is on the very pacer these would join.
  useFavoriteMatchPrefetch(fixtures, favoriteTeamIds, isToday && !isLoading && !isRevalidating);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // A pull to refresh asks for the real thing: drop what the caches derived
      // from the previous fetch before refetching over it. Best-effort, like
      // the refreshes themselves — a cache that stays warm is not a failure.
      try {
        await invalidateSportsCaches(await getSportsDatabase());
      } catch (err) {
        console.warn('[sports] Sports database unavailable:', err);
      }
      await Promise.allSettled([refresh(), refreshTeams()]);
    } finally {
      setIsRefreshing(false);
    }
  }, [refresh, refreshTeams]);

  const handleOpenFavorites = useCallback(() => setFavoritesVisible(true), []);
  const handleCloseFavorites = useCallback(() => setFavoritesVisible(false), []);
  const handleJumpToToday = useCallback(() => setSelectedDate(startOfLocalDay(new Date())), []);

  /**
   * The competition, on the day it was opened from. The header fields travel
   * with it so its surface has something to show before its own day read
   * lands; the key and the date are what it re-resolves the group by.
   */
  const handleOpenLeague = useCallback(
    (group: MatchGroup, tab: LeagueTab = 'matches') =>
      openLeague({
        key: group.key,
        competitionId: group.competitionId,
        title: group.title,
        subtitle: group.subtitle,
        logoUrl: group.logoUrl,
        dateIso: selectedDate.toISOString(),
        tab,
      }),
    [openLeague, selectedDate]
  );

  const handleToggleFavorite = useCallback(
    async (team: Team, isFavorite: boolean) => {
      if (isFavorite) await addTeam(team);
      else await removeTeam(team.provider, team.providerId);
    },
    [addTeam, removeTeam]
  );

  const showFavoritesPrompt = !isLoadingTeams && teams.length === 0;
  // A fresh element on every render would defeat `memo(MatchesList)`, so the
  // whole list re-renders on every poll tick.
  const header = useMemo(
    () => (
      <SportsHeader
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        filter={filter}
        onFilterChange={setFilter}
        liveCount={liveCount}
        onOpenFavorites={handleOpenFavorites}
        onJumpToToday={handleJumpToToday}
        isToday={isToday}
        showFavoritesPrompt={showFavoritesPrompt}
        topInset={insets.top}
      />
    ),
    [
      selectedDate,
      filter,
      liveCount,
      handleOpenFavorites,
      handleJumpToToday,
      isToday,
      showFavoritesPrompt,
      insets.top,
    ]
  );

  const emptyTitle =
    filter === 'live'
      ? 'No live matches right now'
      : hideOtherLeagues
        ? 'No matches in your leagues'
        : 'No matches on this day';
  const emptyHint =
    filter === 'live'
      ? 'Switch to All to see the full schedule.'
      : hideOtherLeagues
        ? 'Turn off "Only show my leagues" in Settings to see everything.'
        : undefined;

  return (
    <>
      <MatchesList
        groups={groups}
        favoriteTeamIds={favoriteTeamIds}
        isLoading={isLoading}
        isRevalidating={isRevalidating}
        error={error}
        isRefreshing={isRefreshing}
        onRefresh={handleRefresh}
        onFixturePress={openMatch}
        onOpenLeague={handleOpenLeague}
        emptyTitle={emptyTitle}
        emptyHint={emptyHint}
        bottomInset={chromeInsets.bottom}
        header={header}
      />

      {/* A transient control rather than a surface of its own: it picks the
          teams this list is built from and has nothing to come back to. */}
      {favoritesVisible && (
        <ManageFavoritesModal
          onClose={handleCloseFavorites}
          favoriteTeams={teams}
          onToggleFavorite={handleToggleFavorite}
        />
      )}
    </>
  );
}
