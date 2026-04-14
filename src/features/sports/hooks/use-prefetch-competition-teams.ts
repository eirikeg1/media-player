import { getSportsDatabase } from '@/services/sports-service';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';

const CACHE_TTL = 21_600; // 6 hours

/** Pre-fetches and caches team lists for all competitions when the sports tab is focused. */
export function usePrefetchCompetitionTeams() {
  const hasFetched = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (hasFetched.current) return;
      hasFetched.current = true;

      (async () => {
        try {
          const db = await getSportsDatabase();
          const competitions = await db.getCompetitions(CACHE_TTL);
          await Promise.allSettled(
            competitions.map((c) => db.getCompetitionTeams(c.providerId, CACHE_TTL))
          );
        } catch (err) {
          console.warn('[usePrefetchCompetitionTeams] Error:', err);
        }
      })();
    }, [])
  );
}
