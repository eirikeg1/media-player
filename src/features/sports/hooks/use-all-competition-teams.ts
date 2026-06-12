import { getSportsDatabase } from '@/services/sports-service';
import type { TeamSearchResult } from 'expo-m3u-parser';
import { useCallback, useEffect, useRef, useState } from 'react';

const CACHE_TTL = 21_600; // 6 hours

export function useAllCompetitionTeams() {
  const [teams, setTeams] = useState<TeamSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const fetchRef = useRef(0);

  const load = useCallback(async () => {
    const fetchId = ++fetchRef.current;
    setIsLoading(true);

    try {
      const db = await getSportsDatabase();

      // Single native call: refreshes stale competitions sequentially under
      // the provider's rate limiting (cache-or-fetch per competition).
      await db.refreshAllCompetitionTeams(CACHE_TTL);

      if (fetchId !== fetchRef.current) return;

      // Read the full cached set
      const result = await db.getAllCachedCompetitionTeams();
      if (fetchId === fetchRef.current) {
        setTeams(result);
      }
    } catch (err) {
      console.warn('[useAllCompetitionTeams] Error:', err);
    } finally {
      if (fetchId === fetchRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { teams, isLoading, refresh: load };
}
