import type { Competition } from 'expo-m3u-parser';

/**
 * Competitions shown first in the matches list, in order, unless the user
 * has customised the order in Settings → Sports. Ids are SofaScore
 * unique-tournament ids (see `sports-provider/src/sofascore/registry.rs`).
 */
export const DEFAULT_LEAGUE_ORDER: readonly number[] = [
  7, // UEFA Champions League
  17, // Premier League
  8, // La Liga
  23, // Serie A
  35, // Bundesliga
  34, // Ligue 1
  679, // UEFA Europa League
  17015, // UEFA Conference League
  20, // Eliteserien
  18, // Championship
  37, // Eredivisie
  238, // Primeira Liga
  16, // FIFA World Cup
];

/**
 * The effective league order: the user's saved order first, then any known
 * competition the saved order doesn't mention (so leagues added to the app
 * after the user customised still appear), in default order.
 */
export function resolveLeagueOrder(
  saved: readonly number[] | undefined,
  known: readonly Competition[]
): number[] {
  const knownIds = known.map((c) => c.providerId);
  const base = saved && saved.length > 0 ? saved : DEFAULT_LEAGUE_ORDER;
  const seen = new Set<number>();
  const ordered: number[] = [];
  for (const id of [...base, ...DEFAULT_LEAGUE_ORDER, ...knownIds]) {
    if (!seen.has(id)) {
      seen.add(id);
      ordered.push(id);
    }
  }
  return ordered;
}

/** Move the league at `index` one step up (-1) or down (+1); no-op at the edges. */
export function moveLeague(order: readonly number[], index: number, delta: -1 | 1): number[] {
  const target = index + delta;
  if (index < 0 || index >= order.length || target < 0 || target >= order.length) {
    return [...order];
  }
  const next = [...order];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** SofaScore tournament logo, for competitions that aren't in the registry. */
export function competitionLogoUrl(competitionId: number): string {
  return `https://api.sofascore.app/api/v1/unique-tournament/${competitionId}/image`;
}
