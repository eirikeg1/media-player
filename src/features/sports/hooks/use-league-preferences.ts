import { saveSetting } from '@/features/user/save-setting';
import { useUserStore } from '@/stores/user/user-store';
import type { Competition } from 'expo-m3u-parser';
import { useCallback, useMemo } from 'react';

import { resolveLeagueOrder } from '../league-preferences';
import { useCompetitions } from './use-competitions';

export interface LeaguePreferences {
  /** Known competitions (registry), keyed by id. */
  competitions: Competition[];
  /** Effective display order of competition ids. */
  order: number[];
  hideOtherLeagues: boolean;
  setOrder: (order: number[]) => void;
  resetOrder: () => void;
  setHideOtherLeagues: (hide: boolean) => void;
}

/** The user's league ranking and related sports-list preferences. */
export function useLeaguePreferences(): LeaguePreferences {
  // Primitive selectors: the user object is replaced on every settings write.
  const saved = useUserStore((s) => s.currentUser?.settings?.sportsLeagueOrder);
  const hideOtherLeagues = useUserStore((s) => s.currentUser?.settings?.sportsHideOtherLeagues ?? false);
  const { competitions } = useCompetitions();

  const order = useMemo(() => resolveLeagueOrder(saved, competitions), [saved, competitions]);

  const setOrder = useCallback((next: number[]) => {
    void saveSetting({ sportsLeagueOrder: next }, 'league order');
  }, []);
  const resetOrder = useCallback(() => {
    void saveSetting({ sportsLeagueOrder: undefined }, 'league order');
  }, []);
  const setHideOtherLeagues = useCallback((hide: boolean) => {
    void saveSetting({ sportsHideOtherLeagues: hide }, 'league filter');
  }, []);

  return { competitions, order, hideOtherLeagues, setOrder, resetOrder, setHideOtherLeagues };
}
