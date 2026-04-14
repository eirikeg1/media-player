import { getSportsDatabase } from '@/services/sports-service';
import type { Competition } from 'expo-m3u-parser';
import { useEffect, useState } from 'react';

export function useCompetitions() {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    (async () => {
      try {
        const db = await getSportsDatabase();
        const result = await db.getCompetitions(21600);
        if (!cancelled) setCompetitions(result);
      } catch (err) {
        console.warn('[useCompetitions] Error:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { competitions, isLoading };
}
