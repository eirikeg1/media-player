/**
 * One place to turn a failure anywhere in the sports feature into something a
 * person can read. See {@link sportsErrorMessage}.
 */

/**
 * The module's stable error `code`, read structurally.
 *
 * Deliberately not `instanceof M3uParserError`: a rejection reaches here after
 * crossing UniFFI, a jest module mock and sometimes a `Promise.allSettled`, and
 * any of those can hand over a plain object or an `Error` that merely carries
 * the code. Branching on the class made the coded branch unreachable for all of
 * them; branching on the property is what the code is for.
 */
function errorCode(err: unknown): string | undefined {
  const code = (err as { code?: unknown } | null | undefined)?.code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * User-facing text for a failure inside the sports feature.
 *
 * Every fetch here crosses UniFFI into the Rust provider, so a rejection
 * carries whatever the backend or SofaScore said — `HttpError(429)`,
 * `SerdeError(...)`, a raw SQLite message. None of that belongs on screen, and
 * putting the mapping in one place keeps every surface (day list, team surface,
 * table, scorers, match detail) saying the same thing about the same failure.
 *
 * Classified by {@link errorCode} first, and a code that is recognised but not
 * actionable falls straight through to `fallback`: the messages are written for
 * people and get reworded, so matching their text could never tell "the
 * provider rate-limited us" from a message that merely mentions rate limiting.
 * The regexes remain for anything that reaches here without a code — a plain
 * `Error` thrown in JS, or a rejection from outside the module.
 *
 * The few causes a user can actually act on are recognised and named; anything
 * else falls back to the caller's own description of what failed to load.
 */
export function sportsErrorMessage(err: unknown, fallback: string): string {
  const RATE_LIMITED = 'The score provider is rate-limiting — try again shortly.';
  const BLOCKED = 'The score provider is refusing requests right now — try again later.';
  const OFFLINE = 'No connection to the score provider.';

  const code = errorCode(err);
  if (code !== undefined) {
    switch (code) {
      case 'RATE_LIMITED':
        return RATE_LIMITED;
      // A 403 is not a 429: retrying sooner makes it worse, so it gets its own
      // wording rather than inviting the user to try again "shortly".
      case 'BLOCKED':
        return BLOCKED;
      case 'NETWORK':
        return OFFLINE;
      default:
        return fallback;
    }
  }

  const message = err instanceof Error ? err.message : String(err);
  if (/rate.?limit|\b429\b/i.test(message)) {
    return RATE_LIMITED;
  }
  if (/network|timeout|timed out|offline|dns|connect|unreachable/i.test(message)) {
    return OFFLINE;
  }
  return fallback;
}
