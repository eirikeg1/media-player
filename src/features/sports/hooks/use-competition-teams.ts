import { getSportsDatabase } from '@/services/sports-service';
import type { TeamSearchResult } from 'expo-m3u-parser';
import { useEffect, useRef, useState } from 'react';

import { CACHE_ONLY_SECS } from '../fixture-fetch';

const CACHE_TTL = 21_600; // 6 hours

/**
 * One competition's teams, cached-first: a {@link CACHE_ONLY_SECS} read serves
 * whatever is stored without a request (an empty competition counts as stale,
 * so the first ever open still fetches), and the TTL'd read after it refreshes
 * a stale list in place — the user browses the old list instead of a spinner.
 */
export function useCompetitionTeams(compId: number | null) {
  const [teams, setTeams] = useState<TeamSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const fetchRef = useRef(0);

  useEffect(() => {
    if (compId === null) {
      setTeams([]);
      return;
    }

    let cancelled = false;
    const fetchId = ++fetchRef.current;
    setIsLoading(true);

    (async () => {
      try {
        const db = await getSportsDatabase();

        const cached = await db.getCompetitionTeams(compId, CACHE_ONLY_SECS);
        if (cancelled || fetchId !== fetchRef.current) return;
        if (cached.length > 0) {
          setTeams(cached);
          setIsLoading(false);
        }

        const result = await db.getCompetitionTeams(compId, CACHE_TTL);
        if (!cancelled && fetchId === fetchRef.current) {
          setTeams(result);
        }
      } catch (err) {
        console.warn('[useCompetitionTeams] Error:', err);
      } finally {
        if (!cancelled && fetchId === fetchRef.current) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [compId]);

  return { teams, isLoading };
}
