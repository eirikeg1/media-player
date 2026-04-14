import type { DropdownOption } from '@/components/ui/controls/inputs/dropdown';
import { teamKey } from '@/features/sports/utils';
import type { Fixture, Team } from 'expo-m3u-parser';
import { useMemo, useState } from 'react';

interface UseCompetitionSelectionReturn {
  competitionOptions: DropdownOption<number>[];
  effectiveSelectedId: number | null;
  hideCompetitionDropdown: boolean;
  handleSelectCompetition: (id: number) => void;
}

/**
 * Manages competition selection logic:
 * - Derives competition options from fixtures ordered by favorite team priority
 * - Auto-selects first competition if manual selection is invalid
 * - Overrides manual selection when a team is selected (derives from team's fixtures)
 */
export function useCompetitionSelection(
  teams: Team[],
  fixtures: Fixture[],
  selectedTeamKey: string | null
): UseCompetitionSelectionReturn {
  const [selectedCompetitionId, setSelectedCompetitionId] = useState<number | null>(null);

  const competitionOptions = useMemo<DropdownOption<number>[]>(() => {
    const seen = new Map<number, string>();
    const ordered: DropdownOption<number>[] = [];

    // First pass: competitions in favorited team order
    for (const team of teams) {
      const fixture = fixtures.find(
        (f) => f.homeTeamId === team.providerId || f.awayTeamId === team.providerId
      );
      if (fixture?.competitionId && !seen.has(fixture.competitionId)) {
        seen.set(fixture.competitionId, fixture.competitionName);
        ordered.push({ label: fixture.competitionName, value: fixture.competitionId });
      }
    }

    // Second pass: remaining competitions not yet seen
    for (const fixture of fixtures) {
      if (fixture.competitionId && !seen.has(fixture.competitionId)) {
        seen.set(fixture.competitionId, fixture.competitionName);
        ordered.push({ label: fixture.competitionName, value: fixture.competitionId });
      }
    }

    return ordered;
  }, [teams, fixtures]);

  const teamDerivedCompetitionId = useMemo<number | null>(() => {
    if (!selectedTeamKey) return null;

    const selectedTeam = teams.find(
      (t) => teamKey(t.provider, t.providerId) === selectedTeamKey
    );
    if (!selectedTeam) return null;

    const fixture = fixtures.find(
      (f) => f.homeTeamId === selectedTeam.providerId || f.awayTeamId === selectedTeam.providerId
    );
    return fixture?.competitionId ?? null;
  }, [selectedTeamKey, teams, fixtures]);

  const hasTeamSelection = selectedTeamKey !== null && teamDerivedCompetitionId !== null;

  const manualEffectiveId = selectedCompetitionId !== null &&
    competitionOptions.some((o) => o.value === selectedCompetitionId)
    ? selectedCompetitionId
    : competitionOptions.length > 0
      ? competitionOptions[0].value
      : null;

  const effectiveSelectedId = hasTeamSelection ? teamDerivedCompetitionId : manualEffectiveId;

  return {
    competitionOptions,
    effectiveSelectedId,
    hideCompetitionDropdown: hasTeamSelection,
    handleSelectCompetition: setSelectedCompetitionId,
  };
}
