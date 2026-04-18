import { getSportsDatabase } from '@/services/sports-service';
import type { Standing } from 'expo-m3u-parser';
import { useCallback, useEffect, useRef, useState } from 'react';

export function useStandings(competitionId: number | null) {
  const [standings, setStandings] = useState<Standing[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchRef = useRef(0);

  const refresh = useCallback(async () => {
    if (competitionId === null) {
      setStandings([]);
      return;
    }

    const fetchId = ++fetchRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const db = await getSportsDatabase();
      const result = await db.getStandings(competitionId, undefined, undefined, 21600);
      if (fetchId === fetchRef.current) {
        setStandings(result);
      }
    } catch (err) {
      if (fetchId === fetchRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load standings');
        console.error('[useStandings] Error:', err);
      }
    } finally {
      if (fetchId === fetchRef.current) {
        setIsLoading(false);
      }
    }
  }, [competitionId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { standings, isLoading, error, refresh };
}
