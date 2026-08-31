import { getSportsDatabase } from '@/services/sports-service';
import type {
  MatchPlayers,
  MatchPreview,
  MatchScore,
  MatchStatistics,
  MatchTimeline,
  SportsDatabase,
} from 'expo-m3u-parser';
import { useEffect, useRef, useState } from 'react';

import { TTL_LIVE_SECS } from '../match-detail-cache-policy';
import { isMatchConcluded } from '../match-widgets';

export interface MatchDataState<T> {
  data?: T;
  isLoading: boolean;
  error?: string;
}

/** How often live sections silently refresh while their tab is open. */
export const LIVE_REFRESH_MS = 60_000;

function errorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/rate.?limit/i.test(message)) return 'SofaScore is rate-limiting — try again shortly.';
  return 'Could not load match data.';
}

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
 * and only while the overlay is open.
 */
function useLazyMatchData<T>(
  eventId: number | undefined,
  enabled: boolean,
  fetcher: (db: SportsDatabase, id: number, ttlSecs: number) => Promise<T>,
  pollMs: number,
  ttlSecs: number
): MatchDataState<T> {
  const [state, setState] = useState<MatchDataState<T>>({ isLoading: false });
  const requestRef = useRef(0);
  const loadedEventRef = useRef<number | null>(null);

  // Drop the cached result when the event changes so the new match refetches.
  useEffect(() => {
    loadedEventRef.current = null;
    setState({ isLoading: false });
  }, [eventId]);

  useEffect(() => {
    if (!enabled || eventId == null) return;
    let cancelled = false;

    const load = async (silent: boolean) => {
      const requestId = ++requestRef.current;
      if (!silent) setState({ isLoading: true });
      try {
        const db = await getSportsDatabase();
        const data = await fetcher(db, eventId, ttlSecs);
        if (cancelled || requestId !== requestRef.current) return;
        loadedEventRef.current = eventId;
        setState({ data, isLoading: false });
      } catch (err) {
        if (cancelled || requestId !== requestRef.current) return;
        // A background refresh that fails leaves the last good data in place.
        if (silent) return;
        setState({ isLoading: false, error: errorMessage(err) });
      }
    };

    // Show cached data instantly; only fetch up front if this event isn't loaded.
    if (loadedEventRef.current !== eventId) {
      void load(false);
    }

    if (pollMs <= 0) return () => {
      cancelled = true;
    };
    const interval = setInterval(() => void load(true), pollMs);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [eventId, enabled, fetcher, pollMs, ttlSecs]);

  // The fetch effect only flips `isLoading` after the first commit, so an
  // enabled section that hasn't produced data or an error yet reports loading
  // synchronously — the first frame shows the spinner, not the empty state.
  if (enabled && eventId != null && state.data === undefined && state.error === undefined) {
    return { ...state, isLoading: true };
  }
  return state;
}

// Module-level fetchers keep a stable identity across renders so the effect
// above doesn't re-run on every render.
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
 */
export function useLiveMatchScore(eventId: number | undefined, enabled: boolean): MatchScore | null {
  const [score, setScore] = useState<MatchScore | null>(null);

  useEffect(() => {
    setScore(null);
  }, [eventId]);

  useEffect(() => {
    if (!enabled || eventId == null) return;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | undefined;

    const fetchScore = async () => {
      try {
        const db = await getSportsDatabase();
        const next = await db.getMatchScore(eventId, TTL_LIVE_SECS);
        if (cancelled) return;
        setScore(next);
        // The match ended while we were watching — stop polling. A merely
        // not-live status (pre-kickoff, unknown/interrupted) keeps polling.
        if (isMatchConcluded(next.status) && interval) {
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
  }, [eventId, enabled]);

  return score;
}
