import { getSportsDatabase } from '@/services/sports-service';
import type { Team } from 'expo-m3u-parser';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

/**
 * Whether two favorite lists are interchangeable for everything the UI derives
 * from them — the id set that regroups the day, and the name/crest the team
 * rows show. The backend returns them in a stable order.
 */
function sameTeams(a: readonly Team[], b: readonly Team[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (team, index) =>
        team.provider === b[index].provider &&
        team.providerId === b[index].providerId &&
        team.name === b[index].name &&
        team.shortName === b[index].shortName &&
        team.crestUrl === b[index].crestUrl
    )
  );
}

export function useFavoriteTeams() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchRef = useRef(0);

  // `isLoading` covers the first load only: later refreshes (tab focus,
  // pull-to-refresh) keep the current teams on screen instead of flickering.
  const refresh = useCallback(async () => {
    const fetchId = ++fetchRef.current;
    try {
      setError(null);
      const db = await getSportsDatabase();
      const result = await db.getFavoriteTeams();
      if (fetchId === fetchRef.current) {
        // This runs on every tab focus. An unchanged list must keep its array
        // identity: a new one regroups the whole day and re-renders every row.
        setTeams((previous) => (sameTeams(previous, result) ? previous : result));
      }
    } catch (err) {
      if (fetchId === fetchRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load favorite teams');
        console.error('[useFavoriteTeams] Error:', err);
      }
    } finally {
      if (fetchId === fetchRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const addTeam = useCallback(async (team: Team) => {
    try {
      const db = await getSportsDatabase();
      await db.addFavoriteTeam(team);
      await refresh();
    } catch (err) {
      console.error('[useFavoriteTeams] Error adding team:', err);
    }
  }, [refresh]);

  const removeTeam = useCallback(async (provider: string, providerId: number) => {
    const previous = teams;
    setTeams((prev) => prev.filter((t) => !(t.provider === provider && t.providerId === providerId)));
    try {
      const db = await getSportsDatabase();
      await db.removeFavoriteTeam(provider, providerId);
    } catch (err) {
      console.error('[useFavoriteTeams] Error removing team:', err);
      setTeams(previous);
    }
  }, [teams]);

  return { teams, isLoading, error, refresh, addTeam, removeTeam };
}
