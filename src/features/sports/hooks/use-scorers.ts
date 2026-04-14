import { getSportsDatabase } from '@/services/sports-service';
import type { TopScorers } from 'expo-m3u-parser';
import { useCallback, useEffect, useRef, useState } from 'react';

export function useScorers(competitionId: number | null) {
  const [scorers, setScorers] = useState<TopScorers | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchRef = useRef(0);

  const refresh = useCallback(async () => {
    if (competitionId === null) {
      setScorers(null);
      return;
    }

    const fetchId = ++fetchRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const db = await getSportsDatabase();
      const result = await db.getScorers(competitionId, undefined, undefined, 21600);
      if (fetchId === fetchRef.current) {
        setScorers(result);
      }
    } catch (err) {
      if (fetchId === fetchRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load scorers');
        console.error('[useScorers] Error:', err);
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

  return { scorers, isLoading, error, refresh };
}
