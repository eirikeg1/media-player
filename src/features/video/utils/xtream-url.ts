/**
 * Xtream Codes stream URL parsing.
 *
 * Panels serve the same stream in two output formats, MPEG-TS (what the local
 * player uses) and HLS. Chromecast's default receiver handles HLS far better,
 * so casting swaps in the `.m3u8` variant when the panel allows it — which
 * means recognising the URL shape and knowing its HLS sibling.
 */

export interface XtreamUrlInfo {
  /** `http://host:port` */
  serverUrl: string;
  username: string;
  password: string;
  /** The same stream addressed as HLS, for receivers that prefer it. */
  hlsUrl: string;
}

/**
 * Parse an Xtream stream URL into its components plus the HLS variant.
 *
 * Two shapes are recognised, both keyed on their path layout:
 * - live: `http://host:port/username/password/stream_id`
 * - catch-up: `http://host:port/timeshift/username/password/minutes/YYYY-MM-DD:HH-MM/stream_id.ts`
 *
 * Anything else (VOD, non-Xtream, unparseable) yields null — the caller then
 * casts the URL as-is.
 */
export function parseXtreamUrl(url: string): XtreamUrlInfo | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null; // Not a valid URL
  }

  const serverUrl = `${parsed.protocol}//${parsed.host}`;
  const segments = parsed.pathname.split('/').filter(Boolean);

  if (segments.length === 3 && !segments[2].includes('.')) {
    const [username, password, streamId] = segments;
    return {
      serverUrl,
      username,
      password,
      hlsUrl: `${serverUrl}/live/${username}/${password}/${streamId}.m3u8`,
    };
  }

  if (segments.length === 6 && segments[0] === 'timeshift') {
    const [, username, password, minutes, start, file] = segments;
    const streamId = file.replace(/\.[^.]+$/, '');
    return {
      serverUrl,
      username,
      password,
      hlsUrl: `${serverUrl}/timeshift/${username}/${password}/${minutes}/${start}/${streamId}.m3u8`,
    };
  }

  return null;
}
