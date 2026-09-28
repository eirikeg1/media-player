/**
 * URL helpers shared by the playlist/EPG import lifecycle.
 *
 * Playlist and EPG URLs routinely carry the provider account's credentials —
 * either as userinfo (`https://user:pass@host/...`) or as Xtream-style
 * `username`/`password` query parameters. Anything that reaches a log, an error
 * message or a crash report must go through {@link redactCredentials} first.
 */

/** Placeholder written in place of a credential. */
const REDACTED = '***';

/**
 * `scheme://userinfo@` — everything between the scheme and the authority's last
 * `@` is secret. The match is greedy up to that `@` on purpose: a password may
 * itself contain one (`https://user:p@ss@host/…`). Unanchored, because this also
 * runs over error messages that merely embed a URL.
 */
const USERINFO_PATTERN = /\b([a-z][a-z0-9+.-]*:\/\/)[^/?#\s]*@/gi;

/** Query parameters that carry a secret, in any order, casing or separator. */
const CREDENTIAL_PARAM_PATTERN =
  /([?&;](?:username|user|password|pass|pwd|token|auth)=)[^&#;]*/gi;

/**
 * Xtream path-style credentials: `/live/<user>/<pass>/1234.ts`, and the same
 * shape under `/movie/`, `/series/` and `/timeshift/`.
 */
const CREDENTIAL_PATH_PATTERN = /(\/(?:live|movie|series|timeshift)\/)[^/?#]+\/[^/?#]+/gi;

/**
 * Mask the credentials in a URL so it is safe to log or show.
 *
 * Deliberately string-based rather than `URL`-based: this is called from error
 * paths, and it must never throw or reshape a URL that failed to parse. It is
 * also applied to whole error messages, which merely *contain* a URL.
 *
 * @param text A URL, or any message that may embed one; returned unchanged when
 *   it carries no credentials
 * @returns The text with userinfo, credential parameters and Xtream path
 *   credentials masked
 * @example redactCredentials('http://host/get.php?username=a&password=b')
 *   => 'http://host/get.php?username=***&password=***'
 */
export function redactCredentials(text: string): string {
  if (!text) return text;

  return text
    .replace(USERINFO_PATTERN, (_match, scheme: string) => `${scheme}${REDACTED}@`)
    .replace(CREDENTIAL_PARAM_PATTERN, `$1${REDACTED}`)
    .replace(CREDENTIAL_PATH_PATTERN, `$1${REDACTED}/${REDACTED}`);
}

/**
 * Check that a URL is a well-formed HTTP(S) URL.
 *
 * The single implementation used by both the playlist form and the store — a
 * playlist can only be fetched over HTTP(S).
 *
 * @param url The URL to validate
 * @returns True for valid `http:`/`https:` URLs, false for anything else
 */
export function isValidUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;

  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
