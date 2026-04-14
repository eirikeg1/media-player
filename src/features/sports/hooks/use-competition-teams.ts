import { getSportsDatabase } from '@/services/sports-service';
import type { TeamSearchResult } from 'expo-m3u-parser';
import { useEffect, useRef, useState } from 'react';

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
        const result = await db.getCompetitionTeams(compId, 21600);
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
