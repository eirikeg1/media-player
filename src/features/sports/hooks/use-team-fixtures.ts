import { getSportsDatabase } from '@/services/sports-service';
import type { Fixture, Team } from 'expo-m3u-parser';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export function useTeamFixtures(teams: Team[]) {
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchRef = useRef(0);

  // Stabilize dependency to avoid unnecessary refetches when the array reference changes
  const teamsKey = useMemo(() => teams.map((t) => t.providerId).join(','), [teams]);
  const teamsRef = useRef(teams);
  teamsRef.current = teams;

  const fetchFixtures = useCallback(async (maxAgeSecs: number) => {
    const currentTeams = teamsRef.current;
    if (currentTeams.length === 0) {
      setFixtures([]);
      return;
    }

    const fetchId = ++fetchRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const db = await getSportsDatabase();
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const from = startOfDay.toISOString().split('T')[0];
      const toDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
      const to = toDate.toISOString().split('T')[0];
      const fromTs = Math.floor(startOfDay.getTime() / 1000);
      const toTs = Math.floor(toDate.getTime() / 1000);

      const allFixtures: Fixture[][] = [];
      for (const team of currentTeams) {
        if (fetchId !== fetchRef.current) return;
        try {
          const batch = await db.getTeamFixtures(team.providerId, from, to, fromTs, toTs, maxAgeSecs);
          allFixtures.push(batch);
        } catch (err) {
          console.error(`[useTeamFixtures] Error fetching fixtures for ${team.name}:`, err);
          allFixtures.push([]);
        }
      }

      // Merge, deduplicate by providerId, sort by kickoffTime
      const seen = new Set<number>();
      const merged: Fixture[] = [];
      for (const batch of allFixtures) {
        for (const fixture of batch) {
          if (!seen.has(fixture.providerId)) {
            seen.add(fixture.providerId);
            merged.push(fixture);
          }
        }
      }
      merged.sort((a, b) => a.kickoffTime - b.kickoffTime);

      if (fetchId === fetchRef.current) {
        setFixtures(merged);
      }
    } catch (err) {
      if (fetchId === fetchRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load fixtures');
        console.error('[useTeamFixtures] Error:', err);
      }
    } finally {
      if (fetchId === fetchRef.current) {
        setIsLoading(false);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- teamsKey stabilizes the dependency
  }, [teamsKey]);

  // Initial load uses cache
  useEffect(() => {
    fetchFixtures(21600);
  }, [fetchFixtures]);

  // Pull-to-refresh always fetches fresh
  const refresh = useCallback(() => fetchFixtures(0), [fetchFixtures]);

  return { fixtures, isLoading, error, refresh };
}
