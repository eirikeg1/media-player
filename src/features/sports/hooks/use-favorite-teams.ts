import { getSportsDatabase } from '@/services/sports-service';
import type { SportsDatabase, Team } from 'expo-m3u-parser';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef } from 'react';

import { useSportsQuery } from './use-sports-query';

/** Shared identity for "no favourites", so the first loads agree on the list. */
const NO_TEAMS: Team[] = [];

/** There is one favourites list per user; nothing about the key ever changes. */
const FAVORITES_KEY = 'favorite-teams';

const fetchFavorites = (db: SportsDatabase): Promise<Team[]> => db.getFavoriteTeams();

/**
 * Whether two favorite lists are interchangeable for everything the UI derives
 * from them — the id set that regroups the day, and the name/crest the team
 * rows show. The backend returns them in a stable order.
 */
function sameTeams(a: readonly Team[], b: readonly Team[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (team, index) =>
        team.provider === b[index].provider &&
        team.providerId === b[index].providerId &&
        team.name === b[index].name &&
        team.shortName === b[index].shortName &&
        team.crestUrl === b[index].crestUrl
    )
  );
}

export function useFavoriteTeams() {
  const { data, isLoading, error, refresh, setData } = useSportsQuery<string, Team[]>({
    key: FAVORITES_KEY,
    fetcher: fetchFavorites,
    fallback: "Couldn't load your favorite teams.",
    // This reloads on every tab focus. An unchanged list must keep its array
    // identity: a new one regroups the whole day and re-renders every row.
    isEqual: sameTeams,
  });
  const teams = data ?? NO_TEAMS;

  // Every surface that shows favourites needs the same two derivations — the
  // list of ids the day fetch is made with, and the set every row is checked
  // against — and each of them is keyed on identity: a fresh array regroups the
  // whole day, a fresh set re-renders every row. Derived once here so the
  // screen and the detail routes share one identity per unchanged list.
  const teamIds = useMemo(() => teams.map((team) => team.providerId), [teams]);
  const teamIdSet = useMemo<ReadonlySet<number>>(() => new Set(teamIds), [teamIds]);

  // The list as of this render, so the mutations below can roll back to it
  // without depending on `teams` — a dependency that changed identity on every
  // refresh and re-rendered the whole team list with it.
  const teamsRef = useRef(teams);
  teamsRef.current = teams;

  // The query already loads on mount; this is only about coming *back* to the
  // tab, where the favourites may have changed in the picker meanwhile.
  const mountedRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!mountedRef.current) {
        mountedRef.current = true;
        return;
      }
      void refresh();
    }, [refresh])
  );

  const reload = useCallback(() => refresh(), [refresh]);

  // Both mutations rethrow: the caller has an optimistic checkmark on screen and
  // is the only place that can put it back and tell the user what happened.
  const addTeam = useCallback(
    async (team: Team) => {
      try {
        const db = await getSportsDatabase();
        await db.addFavoriteTeam(team);
      } catch (err) {
        console.error('[useFavoriteTeams] Error adding team:', err);
        throw err;
      }
      await refresh();
    },
    [refresh]
  );

  const removeTeam = useCallback(
    async (provider: string, providerId: number) => {
      const previous = teamsRef.current;
      setData(previous.filter((t) => !(t.provider === provider && t.providerId === providerId)));
      try {
        const db = await getSportsDatabase();
        await db.removeFavoriteTeam(provider, providerId);
      } catch (err) {
        console.error('[useFavoriteTeams] Error removing team:', err);
        setData(previous);
        throw err;
      }
    },
    [setData]
  );

  return { teams, teamIds, teamIdSet, isLoading, error, refresh: reload, addTeam, removeTeam };
}
