import { getSportsDatabase } from '@/services/sports-service';
import type {
  MatchDetailMeta,
  MatchPlayers,
  MatchPreview,
  MatchScore,
  MatchStatistics,
  MatchTimeline,
  SportsDatabase,
} from 'expo-m3u-parser';
import { useAppState } from '@/hooks/use-app-state';
import { useCallback, useEffect, useState } from 'react';

import { sameLiveScore } from '../live-score';
import { TTL_LIVE_SECS } from '../match-detail-cache-policy';
import { isConcludedStatus } from '../match-widgets';
import { useSportsQuery } from './use-sports-query';

export interface MatchDataState<T> {
  data?: T;
  isLoading: boolean;
  error?: string;
  /** Fetch the section again, ignoring the native cache age. */
  refresh: () => void;
}

/**
 * A section's state, with the freshness stamp the native side wraps every
 * match-detail payload in.
 *
 * The stamp travels with the data rather than beside it (see
 * {@link MatchDetailMeta}): the native side answers from its cache when the
 * provider refuses, so a payload on screen is not proof that anything was
 * fetched, and the tab needs both to say "as of 20:41" over a section that
 * silently stopped moving.
 */
export type MatchSectionState<T> = MatchDataState<T & MatchDetailMeta>;

/** How often live sections silently refresh while their tab is open. */
export const LIVE_REFRESH_MS = 60_000;

/**
 * Lazily fetch one section of match detail from the native SofaScore provider.
 *
 * Fetching is gated on `enabled` (true only while the section's tab is active)
 * so opening the overlay never fires requests for tabs the user doesn't view.
 * Once a section loads for an event it is remembered, so flipping back to its
 * tab shows the cached result instantly instead of refetching.
 *
 * `ttlSecs` is how stale the *native* cache may be (see
 * `match-detail-cache-policy`), and that cache is what survives the overlay
 * closing: the in-memory memo above only lives as long as this hook.
 *
 * When `pollMs > 0` (live matches) the active section silently refreshes on that
 * interval — no spinner, and a failed refresh keeps the last good data — so the
 * numbers stay current without hammering the API: only the visible tab polls,
 * only while the overlay is open, and only while the app is in the foreground.
 */
function useLazyMatchData<T extends object>(
  eventId: number | undefined,
  enabled: boolean,
  fetcher: (db: SportsDatabase, id: number, ttlSecs: number) => Promise<T & MatchDetailMeta>,
  pollMs: number,
  ttlSecs: number
): MatchSectionState<T> {
  const { data, isLoading, error, refresh } = useSportsQuery<number, T & MatchDetailMeta>({
    key: eventId ?? null,
    enabled,
    fetcher: (db, id) => fetcher(db, id, ttlSecs),
    fallback: "Couldn't load match data.",
    pollMs,
  });

  // Forced: the section is refetched precisely because what the native cache
  // holds is the answer the user is rejecting.
  const retry = useCallback(() => void refresh({ force: true }), [refresh]);

  return { data, isLoading, error: error ?? undefined, refresh: retry };
}

// Module-level fetchers: one closure per section instead of a fresh pair of
// them on every render of every open tab.
const fetchStatistics = (db: SportsDatabase, id: number, ttl: number) =>
  db.getMatchStatistics(id, ttl);
const fetchPlayers = (db: SportsDatabase, id: number, ttl: number) => db.getMatchPlayers(id, ttl);
const fetchTimeline = (db: SportsDatabase, id: number, ttl: number) => db.getMatchTimeline(id, ttl);
const fetchPreview = (db: SportsDatabase, id: number, ttl: number) => db.getMatchPreview(id, ttl);

export const useMatchStatistics = (
  eventId: number | undefined,
  enabled: boolean,
  pollMs: number,
  ttlSecs: number
) => useLazyMatchData<MatchStatistics>(eventId, enabled, fetchStatistics, pollMs, ttlSecs);

export const useMatchPlayers = (
  eventId: number | undefined,
  enabled: boolean,
  pollMs: number,
  ttlSecs: number
) => useLazyMatchData<MatchPlayers>(eventId, enabled, fetchPlayers, pollMs, ttlSecs);

export const useMatchTimeline = (
  eventId: number | undefined,
  enabled: boolean,
  pollMs: number,
  ttlSecs: number
) => useLazyMatchData<MatchTimeline>(eventId, enabled, fetchTimeline, pollMs, ttlSecs);

// The pre-match preview (form + H2H) doesn't change during play, so it never polls.
export const useMatchPreview = (eventId: number | undefined, enabled: boolean, ttlSecs: number) =>
  useLazyMatchData<MatchPreview>(eventId, enabled, fetchPreview, 0, ttlSecs);

/**
 * Poll just the scoreline + status of a match. Fetches immediately and then
 * once per {@link LIVE_REFRESH_MS} while `enabled`; polling continues through
 * scheduled and interrupted spells (so kickoff and resumptions are caught) and
 * stops itself for good once the match concludes. Returns `null` until the
 * first response; a failed poll keeps the previous value. Callers merge this
 * over the fixture they already hold so the displayed score stays current.
 *
 * Every poll reads through the native cache at {@link TTL_LIVE_SECS} rather
 * than the fixture's own policy TTL: this hook runs precisely while the match
 * can still change state, and catching kickoff is the whole point — a longer
 * lifetime would leave the header showing "not started" minutes into the game.
 * It is one cheap request, and only while an overlay or the player is open.
 *
 * Bespoke rather than a {@link useSportsQuery}: its poll has to stop itself the
 * moment the match concludes, which no interval the primitive owns can decide.
 */
export function useLiveMatchScore(
  eventId: number | undefined,
  enabled: boolean
): (MatchScore & MatchDetailMeta) | null {
  const [score, setScore] = useState<(MatchScore & MatchDetailMeta) | null>(null);
  // Nobody is reading the score while the app is backgrounded, and the surface or
  // player holding this open can outlive a whole half. Coming back to the
  // foreground fetches once and resumes the poll.
  const appActive = useAppState() === 'active';

  useEffect(() => {
    setScore(null);
  }, [eventId]);

  useEffect(() => {
    if (!enabled || !appActive || eventId == null) return;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | undefined;

    const fetchScore = async () => {
      try {
        const db = await getSportsDatabase();
        const next = await db.getMatchScore(eventId, TTL_LIVE_SECS);
        if (cancelled) return;
        // Nothing changed on most polls; keeping the previous object spares the
        // open surface (and the player above it) a re-render every minute.
        setScore((previous) => (previous && sameLiveScore(previous, next) ? previous : next));
        // The match ended while we were watching — stop polling. A merely
        // not-live status (pre-kickoff, unknown/interrupted) keeps polling.
        if (isConcludedStatus(next.status) && interval) {
          clearInterval(interval);
          interval = undefined;
        }
      } catch {
        // Keep the last known score on a transient failure.
      }
    };

    void fetchScore();
    interval = setInterval(() => void fetchScore(), LIVE_REFRESH_MS);
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [eventId, enabled, appActive]);

  return score;
}
