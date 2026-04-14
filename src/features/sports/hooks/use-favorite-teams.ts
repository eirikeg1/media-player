import { getSportsDatabase } from '@/services/sports-service';
import type { Team } from 'expo-m3u-parser';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

export function useFavoriteTeams() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchRef = useRef(0);

  const refresh = useCallback(async () => {
    const fetchId = ++fetchRef.current;
    try {
      setIsLoading(true);
      setError(null);
      const db = await getSportsDatabase();
      const result = await db.getFavoriteTeams();
      if (fetchId === fetchRef.current) {
        setTeams(result);
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
