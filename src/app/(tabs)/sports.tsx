import { invalidateSportsCaches } from '@/features/sports/cache-invalidation';
import { useDayFixtures } from '@/features/sports/hooks/use-day-fixtures';
import { useFavoriteMatchPrefetch } from '@/features/sports/hooks/use-favorite-match-prefetch';
import { useFavoriteTeams } from '@/features/sports/hooks/use-favorite-teams';
import { useLeaguePreferences } from '@/features/sports/hooks/use-league-preferences';
import { LeagueSheet } from '@/features/sports/league-sheet';
import { groupFixturesByLeague, type MatchGroup } from '@/features/sports/match-grouping';
import { MatchSheet } from '@/features/sports/match-sheet';
import { isMatchLive } from '@/features/sports/match-widgets';
import { MatchesList } from '@/features/sports/matches-list';
import { SportsHeader, type MatchFilter } from '@/features/sports/sports-header';
import { isSameLocalDay, startOfLocalDay } from '@/features/sports/date-utils';
import { ManageFavoritesModal } from '@/features/sports/team-search-modal';
import { getSportsDatabase } from '@/services/sports-service';
import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import { usePlaybackQueueStore } from '@/stores/video/queue-store';
import { useRouter } from 'expo-router';
import type { Fixture, Team } from 'expo-m3u-parser';
import { useCallback, useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SportsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const activePlaylistId = usePlaylistStore((s) => s.activePlaylistId);

  const [selectedDate, setSelectedDate] = useState(() => startOfLocalDay(new Date()));
  const [filter, setFilter] = useState<MatchFilter>('all');
  const [favoritesVisible, setFavoritesVisible] = useState(false);
  const [selectedFixture, setSelectedFixture] = useState<Fixture | null>(null);
  const [selectedLeagueKey, setSelectedLeagueKey] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { teams, isLoading: isLoadingTeams, addTeam, removeTeam, refresh: refreshTeams } = useFavoriteTeams();
  const { order, hideOtherLeagues } = useLeaguePreferences();
  const favoriteTeamIdList = useMemo(() => teams.map((t) => t.providerId), [teams]);
  const { fixtures, isLoading, error, refresh } = useDayFixtures(selectedDate, favoriteTeamIdList);

  const favoriteTeamIds = useMemo(() => new Set(favoriteTeamIdList), [favoriteTeamIdList]);
  const liveCount = useMemo(() => fixtures.filter(isMatchLive).length, [fixtures]);
  // Unfiltered grouping: what the league sheet resolves against, so the sheet
  // survives both the minute-level poll (it re-reads the group by key and picks
  // up fresh scores instead of rendering a stale snapshot) and an All/Live
  // toggle made while it is open.
  const allGroups = useMemo(
    () => groupFixturesByLeague(fixtures, { favoriteTeamIds, leagueOrder: order, hideOtherLeagues }),
    [fixtures, favoriteTeamIds, order, hideOtherLeagues]
  );
  const groups = useMemo(
    () =>
      filter === 'live'
        ? groupFixturesByLeague(fixtures, { favoriteTeamIds, leagueOrder: order, hideOtherLeagues, liveOnly: true })
        : allGroups,
    [allGroups, fixtures, favoriteTeamIds, order, hideOtherLeagues, filter]
  );
  const selectedLeague = useMemo(
    () => allGroups.find((g) => g.key === selectedLeagueKey) ?? null,
    [allGroups, selectedLeagueKey]
  );
  const isToday = isSameLocalDay(selectedDate, new Date());

  useFavoriteMatchPrefetch(fixtures, favoriteTeamIds, isToday);

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
  const handleCloseFixture = useCallback(() => setSelectedFixture(null), []);
  const handleCloseLeague = useCallback(() => setSelectedLeagueKey(null), []);

  const handleOpenLeague = useCallback((group: MatchGroup) => setSelectedLeagueKey(group.key), []);

  /** From the league sheet: close it first so the match sheet isn't stacked behind it. */
  const handleLeagueFixturePress = useCallback((fixture: Fixture) => {
    setSelectedLeagueKey(null);
    setSelectedFixture(fixture);
  }, []);

  const handleToggleFavorite = useCallback(
    async (team: Team, isFavorite: boolean) => {
      if (isFavorite) await addTeam(team);
      else await removeTeam(team.provider, team.providerId);
    },
    [addTeam, removeTeam]
  );

  const handlePlayChannel = useCallback(
    (channelId: string, fixture: Fixture) => {
      setSelectedFixture(null);
      usePlaybackQueueStore.getState().reset();
      router.push({
        pathname: '/video-player',
        params: {
          channelId,
          playlistId: activePlaylistId ?? '',
          contentType: 'live',
          // Carry the fixture so the player can show SofaScore match widgets.
          fixture: JSON.stringify(fixture),
        },
      });
    },
    [router, activePlaylistId]
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
        error={error}
        isRefreshing={isRefreshing}
        onRefresh={handleRefresh}
        onFixturePress={setSelectedFixture}
        onOpenLeague={handleOpenLeague}
        emptyTitle={emptyTitle}
        emptyHint={emptyHint}
        bottomInset={insets.bottom + 64}
        header={
          <SportsHeader
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            filter={filter}
            onFilterChange={setFilter}
            liveCount={liveCount}
            onOpenFavorites={handleOpenFavorites}
            onJumpToToday={handleJumpToToday}
            isToday={isToday}
            showFavoritesPrompt={!isLoadingTeams && teams.length === 0}
            topInset={insets.top}
          />
        }
      />

      {favoritesVisible && (
        <ManageFavoritesModal
          onClose={handleCloseFavorites}
          favoriteTeams={teams}
          onToggleFavorite={handleToggleFavorite}
        />
      )}

      <MatchSheet fixture={selectedFixture} onClose={handleCloseFixture} onPlayChannel={handlePlayChannel} />
      <LeagueSheet
        group={selectedLeague}
        favoriteTeamIds={favoriteTeamIds}
        onClose={handleCloseLeague}
        onFixturePress={handleLeagueFixturePress}
      />
    </>
  );
}
