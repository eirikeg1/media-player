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
  const currentUser = useUserStore((s) => s.currentUser);
  const updateSettings = useUserStore((s) => s.updateSettings);
  const { competitions } = useCompetitions();

  const saved = currentUser?.settings?.sportsLeagueOrder;
  const hideOtherLeagues = currentUser?.settings?.sportsHideOtherLeagues ?? false;
  const order = useMemo(() => resolveLeagueOrder(saved, competitions), [saved, competitions]);

  const setOrder = useCallback(
    (next: number[]) => {
      if (!currentUser) return;
      void updateSettings(currentUser.id, { sportsLeagueOrder: next });
    },
    [currentUser, updateSettings]
  );
  const resetOrder = useCallback(() => {
    if (!currentUser) return;
    void updateSettings(currentUser.id, { sportsLeagueOrder: undefined });
  }, [currentUser, updateSettings]);
  const setHideOtherLeagues = useCallback(
    (hide: boolean) => {
      if (!currentUser) return;
      void updateSettings(currentUser.id, { sportsHideOtherLeagues: hide });
    },
    [currentUser, updateSettings]
  );

  return { competitions, order, hideOtherLeagues, setOrder, resetOrder, setHideOtherLeagues };
}
