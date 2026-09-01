import { getSportsDatabase } from '@/services/sports-service';
import type { TeamSearchResult } from 'expo-m3u-parser';
import { useCallback, useEffect, useRef, useState } from 'react';

const CACHE_TTL = 21_600; // 6 hours

/**
 * Every cached competition team, kept current in the background.
 *
 * Cached-first: the stored set renders immediately, because the refresh sweep
 * behind it re-fetches every stale competition sequentially under the
 * provider's rate limiting and can take many seconds — a spinner for that long
 * over data we already hold would read as "not cached". Only a genuinely empty
 * cache (first ever open) waits on the sweep; otherwise the list updates in
 * place once the sweep lands.
 */
export function useAllCompetitionTeams() {
  const [teams, setTeams] = useState<TeamSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const fetchRef = useRef(0);

  const load = useCallback(async () => {
    const fetchId = ++fetchRef.current;
    setIsLoading(true);

    try {
      const db = await getSportsDatabase();

      const cached = await db.getAllCachedCompetitionTeams();
      if (fetchId !== fetchRef.current) return;
      if (cached.length > 0) {
        setTeams(cached);
        setIsLoading(false);
      }

      // Single native call: refreshes stale competitions sequentially under
      // the provider's rate limiting (cache-or-fetch per competition).
      await db.refreshAllCompetitionTeams(CACHE_TTL);
      if (fetchId !== fetchRef.current) return;

      // Read the full refreshed set
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
