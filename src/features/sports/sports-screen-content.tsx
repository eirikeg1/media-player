import ParallaxScrollView from '@/components/ui/containers/parallax-scroll-view';
import type { DropdownOption } from '@/components/ui/controls/inputs/dropdown';
import { Image } from 'expo-image';
import type { Fixture, Standing, Team, TopScorers } from 'expo-m3u-parser';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { FavoriteTeamsSection } from './favorite-teams-section';
import { FixtureList } from './fixture-list';
import { ScorersList } from './scorers-list';
import { SportsEmptyState } from './sports-empty-state';
import { SportsTopBar, type SportsSection } from './sports-top-bar';
import { StandingsTable } from './standings-table';

const DEFAULT_HEADER = require('../../../assets/images/parallax-headers/general/blue-minimalist-wavy.jpg');

interface SportsScreenContentProps {
  teams: Team[];
  selectedSection: SportsSection;
  onSectionSelect: (section: SportsSection) => void;
  onAddTeamPress: () => void;
  onRemoveTeam: (provider: string, providerId: number) => void;
  onSelectTeam: (team: Team) => void;
  selectedTeamKey: string | null;

  // Fixtures
  fixtures: Fixture[];
  isLoadingFixtures: boolean;
  fixturesError: string | null;

  // Standings
  standings: Standing[];
  isLoadingStandings: boolean;
  standingsError: string | null;
  competitionOptions: DropdownOption<number>[];
  selectedCompetitionId: number | null;
  onSelectCompetition: (id: number) => void;
  hideCompetitionDropdown: boolean;

  // Scorers
  scorers: TopScorers | null;
  isLoadingScorers: boolean;
  scorersError: string | null;

  // Refresh
  isRefreshing: boolean;
  onRefresh: () => void;
}

export const SportsScreenContent = memo(function SportsScreenContent({
  teams,
  selectedSection,
  onSectionSelect,
  onAddTeamPress,
  onRemoveTeam,
  onSelectTeam,
  selectedTeamKey,
  fixtures,
  isLoadingFixtures,
  fixturesError,
  standings,
  isLoadingStandings,
  standingsError,
  competitionOptions,
  selectedCompetitionId,
  onSelectCompetition,
  hideCompetitionDropdown,
  scorers,
  isLoadingScorers,
  scorersError,
  isRefreshing,
  onRefresh,
}: SportsScreenContentProps) {
  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: '#2D2D2D', dark: '#1A1A1A' }}
      padding={0}
      showsVerticalScrollIndicator={false}
      refreshing={isRefreshing}
      onRefresh={onRefresh}
      headerImage={
        <View style={styles.headerContainer}>
          <Image source={DEFAULT_HEADER} style={styles.headerBackground} contentFit="cover" />
        </View>
      }
    >
      {teams.length === 0 ? (
        <SportsEmptyState onAddTeams={onAddTeamPress} />
      ) : (
        <View style={styles.content}>
          <FavoriteTeamsSection
            teams={teams}
            onAddPress={onAddTeamPress}
            onRemoveTeam={onRemoveTeam}
            onSelectTeam={onSelectTeam}
            selectedTeamKey={selectedTeamKey}
          />

          <SportsTopBar selected={selectedSection} onSelect={onSectionSelect} />

          {selectedSection === 'fixtures' && (
            <FixtureList fixtures={fixtures} isLoading={isLoadingFixtures} error={fixturesError} />
          )}

          {selectedSection === 'standings' && (
            <StandingsTable
              standings={standings}
              isLoading={isLoadingStandings}
              error={standingsError}
              competitionOptions={competitionOptions}
              selectedCompetitionId={selectedCompetitionId}
              onSelectCompetition={onSelectCompetition}
              hideDropdown={hideCompetitionDropdown}
            />
          )}

          {selectedSection === 'scorers' && (
            <ScorersList
              scorers={scorers}
              isLoading={isLoadingScorers}
              error={scorersError}
              competitionOptions={competitionOptions}
              selectedCompetitionId={selectedCompetitionId}
              onSelectCompetition={onSelectCompetition}
              hideDropdown={hideCompetitionDropdown}
            />
          )}
        </View>
      )}
    </ParallaxScrollView>
  );
});

const styles = StyleSheet.create({
  headerContainer: {
    width: '100%',
    height: '100%',
  },
  headerBackground: {
    width: '100%',
    height: '100%',
  },
  content: {
    gap: 16,
    paddingVertical: 16,
  },
});
