import { getRustDatabase } from '@/services/rust-channel-service';
import type { EpgProgramme, EpgSource } from 'expo-m3u-parser';

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
   * @returns Array of detected EPG sources
   */
  static async detectAndFetchEpgSources(playlistId: string, epgUrl?: string): Promise<EpgSource[]> {
    const pipelineStart = Date.now();
    if (__DEV__) {
      console.log(`[EpgService] detectAndFetchEpgSources started for playlist: ${playlistId}`, epgUrl ? `(user EPG URL: ${epgUrl})` : '');
    }

    const db = await getRustDatabase();

    // 1. User-provided EPG URL — upsert as a source first
    if (epgUrl) {
      const userSource: EpgSource = {
        id: `user-${playlistId}`,
        url: epgUrl,
        name: 'User-configured XMLTV',
        autoDetected: false,
        programmeCount: 0,
        playlistId,
      };
      await db.upsertEpgSource(userSource);
      if (__DEV__) {
        console.log(`[EpgService] Upserted user-provided EPG source: ${epgUrl}`);
      }
    }

    // 2. tvg_url scan from channel metadata
    const sources = await db.detectEpgSources(playlistId);

    if (__DEV__) {
      console.log(`[EpgService] tvg_url scan found ${sources.length} source(s)`);
    }

    // Ensure user source is in the list (detectEpgSources may have returned it)
    if (epgUrl && !sources.some((s) => s.url === epgUrl)) {
      sources.unshift({
        id: `user-${playlistId}`,
        url: epgUrl,
        name: 'User-configured XMLTV',
        autoDetected: false,
        programmeCount: 0,
        playlistId,
      });
    }

    // 3. Fallback: derive EPG URL from Xtream playlist URL pattern
    if (sources.length === 0) {
      const xtreamUrl = await this.deriveXtreamEpgUrl(db, playlistId);
      if (xtreamUrl) {
        if (__DEV__) {
          console.log(`[EpgService] Xtream fallback derived EPG URL: ${xtreamUrl}`);
        }
        const source: EpgSource = {
          id: `xtream-${playlistId}`,
          url: xtreamUrl,
          name: 'Xtream XMLTV',
          autoDetected: true,
          programmeCount: 0,
          playlistId,
        };
        await db.upsertEpgSource(source);
        sources.push(source);
      }
    }

    if (sources.length === 0) {
      if (__DEV__) {
        console.log(`[EpgService] No EPG sources found (${Date.now() - pipelineStart}ms)`);
      }
      return [];
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
              `[EpgService] Fetched ${count} programme(s) from ${source.url} (${Date.now() - fetchStart}ms)`
            );
          }
          return count;
        })
        .catch((err) => {
          failedSources.push(source.name || source.url);
          console.error(
            `[EpgService] Failed to fetch EPG source "${source.name}" (${source.url}):`,
            err instanceof Error ? err.message : err
          );
          return 0;
        });
    });

    const results = await Promise.all(fetchPromises);
    const totalProgrammes = results.reduce((sum, count) => sum + count, 0);

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

    return sources;
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
   */
  static async getCurrentProgrammesForChannels(
    channelIds: string[]
  ): Promise<Map<string, EpgProgramme>> {
    if (channelIds.length === 0) {
      return new Map();
    }

    const db = await getRustDatabase();
    const programmes = await db.getCurrentProgrammesForChannels(channelIds);

    const map = new Map<string, EpgProgramme>();
    for (const programme of programmes) {
      map.set(programme.channelId, programme);
    }
    return map;
  }

  /**
   * Get the schedule for a single channel within a time range
   */
  static async getChannelSchedule(
    channelId: string,
    from: number,
    to: number
  ): Promise<EpgProgramme[]> {
    const db = await getRustDatabase();
    return db.getChannelSchedule(channelId, from, to);
  }

  /**
   * Get the currently airing programme for a single channel
   */
  static async getCurrentProgramme(channelId: string): Promise<EpgProgramme | null> {
    const db = await getRustDatabase();
    return db.getCurrentProgramme(channelId);
  }

  /**
   * Get the next programme for a single channel
   */
  static async getNextProgramme(channelId: string): Promise<EpgProgramme | null> {
    const db = await getRustDatabase();
    return db.getNextProgramme(channelId);
  }

  /**
   * Get programmes for multiple channels in a time range (for EPG guide grid).
   * Returns a Map keyed by channelId with sorted programme arrays.
   */
  static async getProgrammesForChannels(
    channelIds: string[],
    from: number,
    to: number
  ): Promise<Map<string, EpgProgramme[]>> {
    if (channelIds.length === 0) {
      return new Map();
    }

    const db = await getRustDatabase();
    const programmes = await db.getProgrammesForChannels(channelIds, from, to);

    const map = new Map<string, EpgProgramme[]>();
    for (const programme of programmes) {
      const existing = map.get(programme.channelId);
      if (existing) {
        existing.push(programme);
      } else {
        map.set(programme.channelId, [programme]);
      }
    }

    // Sort each channel's programmes by start time
    for (const progs of map.values()) {
      progs.sort((a, b) => a.start - b.start);
    }

    return map;
  }

  /**
   * Search programmes by title with optional filters.
   */
  static async searchProgrammes(
    query: string,
    options?: {
      from?: number;
      to?: number;
      category?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ programmes: EpgProgramme[]; totalCount: number }> {
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
