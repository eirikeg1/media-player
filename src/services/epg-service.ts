import { redactCredentials } from '@/lib/url-utils';
import { getRustDatabase } from '@/services/rust-channel-service';
import type {
  ChannelShift,
  EpgProgramme,
  EpgSource,
  GroupedProgrammesResult,
  ProgrammeSearchOptions,
} from 'expo-m3u-parser';

/** Outcome of one detect-and-fetch pass over a playlist's EPG sources. */
export interface EpgFetchResult {
  /** Sources detected or configured, whatever their download did. */
  sources: EpgSource[];
  /** Sources whose guide was downloaded and imported. */
  succeeded: number;
  /** Sources whose download failed — their programmes are missing. */
  failed: number;
}

/**
 * Whether the playlist's guide data is as current as its sources allow, and a
 * fetch stamp may therefore be recorded.
 *
 * A playlist with no source has nothing to download and is complete; one whose
 * every source failed is not, and must be retried rather than stamped.
 */
export function isEpgFetchComplete(result: EpgFetchResult): boolean {
  return result.succeeded > 0 || result.failed === 0;
}

/**
 * Service for managing EPG (Electronic Programme Guide) data via Rust backend.
 * Wraps all EPG-related Database methods using the shared singleton.
 */
export class EpgService {
  // ========================================
  // Source Management
  // ========================================

  /**
   * Detect EPG sources from channel tvg_url fields, then fetch and import
   * programme data for each detected source.
   *
   * Priority order:
   * 1. User-provided epgUrl (highest priority)
   * 2. tvg_url scan from channel metadata
   * 3. Xtream URL derivation fallback
   *
   * @param playlistId Playlist to scan for EPG URLs
   * @param epgUrl Optional user-configured EPG/XMLTV URL
   * @returns The detected sources and how many of them downloaded successfully
   */
  static async detectAndFetchEpgSources(
    playlistId: string,
    epgUrl?: string,
  ): Promise<EpgFetchResult> {
    const pipelineStart = Date.now();
    if (__DEV__) {
      console.log(`[EpgService] detectAndFetchEpgSources started for playlist: ${playlistId}`, epgUrl ? `(user EPG URL: ${redactCredentials(epgUrl)})` : '');
    }

    const db = await getRustDatabase();

    // 1. User-provided EPG URL — upsert as a source first
    let userSource: EpgSource | null = null;
    if (epgUrl) {
      const draft: EpgSource = {
        id: `user-${playlistId}`,
        url: epgUrl,
        name: 'User-configured XMLTV',
        autoDetected: false,
        programmeCount: 0,
        playlistId,
      };
      // A URL already registered — auto-detected from a tvg_url by an earlier
      // import, say — keeps the id its programmes are keyed by. Fetching under
      // any other id would import a second copy of the same guide.
      userSource = { ...draft, id: await db.upsertEpgSource(draft) };
      if (__DEV__) {
        console.log(
          `[EpgService] Upserted user-provided EPG source: ${redactCredentials(epgUrl)}`,
        );
      }
    }

    // 2. tvg_url scan from channel metadata
    const sources = await db.detectEpgSources(playlistId);

    if (__DEV__) {
      console.log(`[EpgService] tvg_url scan found ${sources.length} source(s)`);
    }

    // Ensure user source is in the list (detectEpgSources may have returned it),
    // as stored — under the id the upsert reported.
    if (userSource && !sources.some((s) => s.url === userSource.url)) {
      sources.unshift(userSource);
    }

    // 3. Fallback: derive EPG URL from Xtream playlist URL pattern
    if (sources.length === 0) {
      const xtreamUrl = await this.deriveXtreamEpgUrl(db, playlistId);
      if (xtreamUrl) {
        if (__DEV__) {
          console.log(
            `[EpgService] Xtream fallback derived EPG URL: ${redactCredentials(xtreamUrl)}`,
          );
        }
        const draft: EpgSource = {
          id: `xtream-${playlistId}`,
          url: xtreamUrl,
          name: 'Xtream XMLTV',
          autoDetected: true,
          programmeCount: 0,
          playlistId,
        };
        // Stored id again, for the same reason as the user source above.
        sources.push({ ...draft, id: await db.upsertEpgSource(draft) });
      }
    }

    if (sources.length === 0) {
      if (__DEV__) {
        console.log(`[EpgService] No EPG sources found (${Date.now() - pipelineStart}ms)`);
      }
      return { sources, succeeded: 0, failed: 0 };
    }

    // Fetch programmes for each detected source in parallel
    const failedSources: string[] = [];
    const fetchPromises = sources.map((source) => {
      const fetchStart = Date.now();
      return db
        .fetchAndImportEpg(source.id, source.url)
        .then((count) => {
          if (__DEV__) {
            console.log(
              `[EpgService] Fetched ${count} programme(s) from ${redactCredentials(source.url)} (${Date.now() - fetchStart}ms)`
            );
          }
          return count;
        })
        .catch((err) => {
          failedSources.push(source.name || redactCredentials(source.url));
          console.error(
            `[EpgService] Failed to fetch EPG source "${source.name}" (${redactCredentials(source.url)}):`,
            err instanceof Error ? err.message : err
          );
          return null;
        });
    });

    const results = await Promise.all(fetchPromises);
    const imported = results.filter((count): count is number => count !== null);
    const totalProgrammes = imported.reduce((sum, count) => sum + count, 0);

    if (failedSources.length > 0) {
      console.warn(
        `[EpgService] ${failedSources.length}/${sources.length} EPG source(s) failed: ${failedSources.join(', ')}`
      );
    }

    if (__DEV__) {
      console.log(
        `[EpgService] Detected ${sources.length} EPG source(s), imported ${totalProgrammes} programme(s) (total: ${Date.now() - pipelineStart}ms)`
      );
    }

    return { sources, succeeded: imported.length, failed: failedSources.length };
  }

  /**
   * Derive an XMLTV EPG URL from an Xtream-compatible playlist URL.
   * Xtream URLs follow the pattern: {base}/get.php?username=X&password=Y&...
   * The XMLTV endpoint is at: {base}/xmltv.php?username=X&password=Y
   * @returns The XMLTV URL or null if the playlist isn't Xtream-style
   */
  private static async deriveXtreamEpgUrl(
    db: Awaited<ReturnType<typeof getRustDatabase>>,
    playlistId: string
  ): Promise<string | null> {
    try {
      const playlist = await db.getPlaylist(playlistId);
      if (!playlist?.url) return null;

      const parsed = new URL(playlist.url);
      if (!parsed.pathname.endsWith('/get.php')) return null;

      const username = parsed.searchParams.get('username');
      const password = parsed.searchParams.get('password');
      if (!username || !password) return null;

      const epgUrl = new URL(parsed.origin + '/xmltv.php');
      epgUrl.searchParams.set('username', username);
      epgUrl.searchParams.set('password', password);
      return epgUrl.toString();
    } catch {
      return null;
    }
  }

  /**
   * Get EPG sources associated with a playlist
   */
  static async getEpgSourcesByPlaylist(playlistId: string): Promise<EpgSource[]> {
    const db = await getRustDatabase();
    return db.getEpgSourcesByPlaylist(playlistId);
  }

  // ========================================
  // Programme Queries
  // ========================================

  /**
   * Get currently airing programmes for multiple channels.
   * Returns a Map keyed by channelId for O(1) lookups in the grid.
   *
   * Each channel carries its `tvg-shift`, which decides which of its programmes
   * counts as current as well as the times returned — the native side applies
   * both (see `ChannelShift`).
   */
  static async getCurrentProgrammesForChannels(
    channels: ChannelShift[]
  ): Promise<Map<string, EpgProgramme>> {
    if (channels.length === 0) {
      return new Map();
    }

    const db = await getRustDatabase();
    const programmes = await db.getCurrentProgrammesForChannels(channels);

    const map = new Map<string, EpgProgramme>();
    for (const programme of programmes) {
      map.set(programme.channelId, programme);
    }
    return map;
  }

  /**
   * Get the schedule for a single channel within a time range.
   *
   * `shiftHours` is the channel's `tvg-shift`; the window is the caller's own
   * hours either way, because the shift is applied inside the query.
   */
  static async getChannelSchedule(
    channelId: string,
    from: number,
    to: number,
    shiftHours: number = 0
  ): Promise<EpgProgramme[]> {
    const db = await getRustDatabase();
    return db.getChannelSchedule(channelId, from, to, shiftHours);
  }

  /**
   * Get the currently airing programme for a single channel.
   *
   * `shiftHours` is the channel's `tvg-shift`: it decides which programme counts
   * as current, so this agrees with the schedule shown beside it.
   */
  static async getCurrentProgramme(
    channelId: string,
    shiftHours: number = 0
  ): Promise<EpgProgramme | null> {
    const db = await getRustDatabase();
    return db.getCurrentProgramme(channelId, undefined, shiftHours);
  }

  /**
   * Get the next programme for a single channel, shifted like
   * {@link EpgService.getCurrentProgramme}.
   */
  static async getNextProgramme(
    channelId: string,
    shiftHours: number = 0
  ): Promise<EpgProgramme | null> {
    const db = await getRustDatabase();
    return db.getNextProgramme(channelId, undefined, shiftHours);
  }

  /**
   * Get programmes for multiple channels in a time range (for EPG guide grid).
   * Returns a Map keyed by channelId with sorted programme arrays.
   * Grouping, sorting and each channel's `tvg-shift` are handled in Rust — this
   * just converts to Map.
   */
  static async getProgrammesForChannels(
    channels: ChannelShift[],
    from: number,
    to: number
  ): Promise<Map<string, EpgProgramme[]>> {
    if (channels.length === 0) {
      return new Map();
    }

    const db = await getRustDatabase();
    const groups = await db.getProgrammesForChannels(channels, from, to);

    const map = new Map<string, EpgProgramme[]>();
    for (const group of groups) {
      map.set(group.channelId, group.programmes ?? []);
    }
    return map;
  }

  /**
   * Search programmes by title with optional filters.
   * Returns results pre-grouped by channel with a has_more pagination flag.
   *
   * Search covers the whole guide, including channels the caller has not
   * loaded, so `shifts` is a sparse map: list the channels that have a
   * `tvg-shift` and every other channel is matched and returned unshifted.
   */
  static async searchProgrammes(
    query: string,
    options?: ProgrammeSearchOptions
  ): Promise<GroupedProgrammesResult> {
    const db = await getRustDatabase();
    return db.searchProgrammes(query, options);
  }

  // ========================================
  // Housekeeping
  // ========================================

  /**
   * Delete programmes that ended before the cutoff time.
   * @param cutoffHours Number of hours in the past to use as cutoff (default 24)
   * @returns Number of deleted programmes
   */
  static async cleanupExpired(cutoffHours: number = 24): Promise<number> {
    const db = await getRustDatabase();
    const cutoff = Math.floor(Date.now() / 1000) - cutoffHours * 3600;
    return db.cleanupExpiredProgrammes(cutoff);
  }
}
