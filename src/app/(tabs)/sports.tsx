import { useCompetitionSelection } from '@/features/sports/hooks/use-competition-selection';
import { useFavoriteTeams } from '@/features/sports/hooks/use-favorite-teams';
import { useScorers } from '@/features/sports/hooks/use-scorers';
import { useStandings } from '@/features/sports/hooks/use-standings';
import { useTeamFixtures } from '@/features/sports/hooks/use-team-fixtures';
import { SportsScreenContent } from '@/features/sports/sports-screen-content';
import type { SportsSection } from '@/features/sports/sports-top-bar';
import { FixtureDetailModal } from '@/features/sports/fixture-detail-modal';
import { ManageFavoritesModal } from '@/features/sports/team-search-modal';
import { teamKey } from '@/features/sports/utils';
import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import { usePlaybackQueueStore } from '@/stores/video/queue-store';
import { useRouter } from 'expo-router';
import type { Fixture, Team } from 'expo-m3u-parser';
import { useCallback, useMemo, useState } from 'react';

export default function SportsScreen() {
  return <SportsScreenInner />;
}

function SportsScreenInner() {
  // Favorite teams
  const { teams, addTeam, removeTeam, refresh: refreshTeams } = useFavoriteTeams();

  // Section toggle
  const [selectedSection, setSelectedSection] = useState<SportsSection>('fixtures');

  // Modal state
  const [searchModalVisible, setSearchModalVisible] = useState(false);
  const [selectedFixture, setSelectedFixture] = useState<Fixture | null>(null);
  const [fixtureModalVisible, setFixtureModalVisible] = useState(false);

  // Selected team state
  const [selectedTeamKey, setSelectedTeamKey] = useState<string | null>(null);

  // Fixtures
  const { fixtures, isLoading: isLoadingFixtures, error: fixturesError, refresh: refreshFixtures } =
    useTeamFixtures(teams);

  // Competition selection (derived from fixtures + team selection)
  const {
    competitionOptions,
    effectiveSelectedId,
    hideCompetitionDropdown,
    handleSelectCompetition,
  } = useCompetitionSelection(teams, fixtures, selectedTeamKey);

  // Standings & Scorers
  const { standings, isLoading: isLoadingStandings, error: standingsError, refresh: refreshStandings } =
    useStandings(selectedSection === 'standings' ? effectiveSelectedId : null);
  const { scorers, isLoading: isLoadingScorers, error: scorersError, refresh: refreshScorers } =
    useScorers(selectedSection === 'scorers' ? effectiveSelectedId : null);

  // Handlers
  const handleAddTeamPress = useCallback(() => {
    setSearchModalVisible(true);
  }, []);

  const handleCloseSearchModal = useCallback(() => {
    setSearchModalVisible(false);
  }, []);

  const handleFixturePress = useCallback((fixture: Fixture) => {
    setSelectedFixture(fixture);
    setFixtureModalVisible(true);
  }, []);

  const handleCloseFixtureModal = useCallback(() => {
    setFixtureModalVisible(false);
  }, []);

  const handleToggleFavorite = useCallback(
    async (team: Team, isFavorite: boolean) => {
      if (isFavorite) {
        await addTeam(team);
      } else {
        await removeTeam(team.provider, team.providerId);
      }
    },
    [addTeam, removeTeam]
  );

  const handleSelectTeam = useCallback(
    (team: Team) => {
      const key = teamKey(team.provider, team.providerId);
      setSelectedTeamKey((prev) => (prev === key ? null : key));
    },
    []
  );

  // Router + playlist for playback
  const router = useRouter();
  const activePlaylistId = usePlaylistStore((s) => s.activePlaylistId);

  // Channel playback handler
  const handlePlayChannel = useCallback(
    (channelId: string) => {
      setFixtureModalVisible(false);
      usePlaybackQueueStore.getState().reset();
      router.push({
        pathname: '/video-player',
        params: {
          channelId,
          playlistId: activePlaylistId ?? '',
          contentType: 'live',
        },
      });
    },
    [router, activePlaylistId]
  );

  // Filter fixtures by selected team
  const filteredFixtures = useMemo(() => {
    if (!selectedTeamKey) return fixtures;

    const selectedTeam = teams.find(
      (t) => teamKey(t.provider, t.providerId) === selectedTeamKey
    );
    if (!selectedTeam) return fixtures;

    return fixtures.filter(
      (f) => f.homeTeamId === selectedTeam.providerId || f.awayTeamId === selectedTeam.providerId
    );
  }, [fixtures, selectedTeamKey, teams]);

  // Combined refresh
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.allSettled([
        refreshTeams(),
        refreshFixtures(),
        refreshStandings(),
        refreshScorers(),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshTeams, refreshFixtures, refreshStandings, refreshScorers]);

  return (
    <>
      <SportsScreenContent
        teams={teams}
        selectedSection={selectedSection}
        onSectionSelect={setSelectedSection}
        onAddTeamPress={handleAddTeamPress}
        onRemoveTeam={removeTeam}
        onSelectTeam={handleSelectTeam}
        selectedTeamKey={selectedTeamKey}
        fixtures={filteredFixtures}
        isLoadingFixtures={isLoadingFixtures}
        fixturesError={fixturesError}
        onFixturePress={handleFixturePress}
        standings={standings}
        isLoadingStandings={isLoadingStandings}
        standingsError={standingsError}
        competitionOptions={competitionOptions}
        selectedCompetitionId={effectiveSelectedId}
        onSelectCompetition={handleSelectCompetition}
        hideCompetitionDropdown={hideCompetitionDropdown}
        scorers={scorers}
        isLoadingScorers={isLoadingScorers}
        scorersError={scorersError}
        isRefreshing={isRefreshing}
        onRefresh={handleRefresh}
      />

      {searchModalVisible && (
        <ManageFavoritesModal
          onClose={handleCloseSearchModal}
          favoriteTeams={teams}
          onToggleFavorite={handleToggleFavorite}
        />
      )}

      <FixtureDetailModal
        visible={fixtureModalVisible}
        fixture={selectedFixture}
        onClose={handleCloseFixtureModal}
        onPlayChannel={handlePlayChannel}
      />
    </>
  );
}
