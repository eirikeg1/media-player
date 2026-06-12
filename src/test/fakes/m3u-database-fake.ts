/**
 * In-memory fake of `expo-m3u-parser` (the Rust native backend).
 *
 * Mirrors the public `Database` / `SportsDatabase` API surface the app uses,
 * implemented over plain arrays. Imports consume real M3U text (parsed with
 * `iptv-playlist-parser`) and real XMLTV text, so service- and store-level
 * tests exercise the same fixture data end to end without a device.
 *
 * Wired up automatically for every test via `__mocks__/expo-m3u-parser.ts`.
 * Test-only helpers (`__resetM3uFake`, `__registerRemoteM3u`, seeding) are
 * exported here and should be imported from `@/test/fakes/m3u-database-fake`.
 */
import { parse as parseM3u } from 'iptv-playlist-parser';
import { getRawChannelId } from '@/lib/channel-utils';
// Same keyword rules as `apply_group_based_adult_flags` in
// m3u-db/src/operations.rs — one JS source of truth instead of a third copy.
import { isAdultGroup } from '@/lib/group-utils';
import { stripEpisodeInfo } from '@/lib/series-utils';
import type {
  Channel,
  ChannelFilter,
  ChannelMetadata,
  ChannelProgrammes,
  ChannelsWithCount,
  Competition,
  ContentType,
  Credentials,
  EpgProgramme,
  EpgSource,
  Fixture,
  ImportCompleteEvent,
  ImportErrorEvent,
  ImportProgressEvent,
  GroupCount,
  GroupedProgrammesResult,
  PlaylistMetadata,
  RankedBroadcast,
  SeriesFilter,
  SeriesInfo,
  SeriesListResult,
  Standing,
  Team,
  TeamSearchResult,
  TopScorers,
  TvChannel,
} from 'expo-m3u-parser';

// ── Remote-content registry ──
// fetchAndImportPlaylist / fetchAndImportEpg "download" from here instead of
// the network. Register fixture content for a URL before triggering a sync.

const remoteM3u = new Map<string, string>();
const remoteXmltv = new Map<string, string>();

export function __registerRemoteM3u(url: string, content: string): void {
  remoteM3u.set(url, content);
}

export function __registerRemoteXmltv(url: string, content: string): void {
  remoteXmltv.set(url, content);
}

/**
 * Clear all database state and registered remote content.
 *
 * Instances are reset IN PLACE rather than discarded: services cache their
 * `Database.open()` result at module level, so the cached reference and any
 * later `Database.open(path)` in a test must keep observing the same state.
 */
export function __resetM3uFake(): void {
  remoteM3u.clear();
  remoteXmltv.clear();
  for (const db of Database.__instances.values()) db.__clear();
  for (const db of SportsDatabase.__instances.values()) db.__clear();
  importProgressListeners.clear();
  importCompleteListeners.clear();
  importErrorListeners.clear();
}

// ── M3U → Rust Channel mapping ──

/**
 * Mirrors `detect_content_type` in m3u-parser/src/parse_data.rs: URL segments
 * first, then file extension (deferring to a series group), then group
 * keywords. The title is never consulted.
 */
function classifyContentType(url: string, group: string): ContentType {
  const u = url.toLowerCase();
  const g = group.toLowerCase();
  if (u.includes('/movie/')) return 'movie';
  if (u.includes('/series/')) return 'series';
  if (u.includes('/live/')) return 'live';
  if (/\.(mp4|mkv|avi)$/.test(u)) return g.includes('series') ? 'series' : 'movie';
  if (g.includes('movie') || g.includes('vod') || g.includes('cinema')) return 'movie';
  if (g.includes('series') || g.includes('show')) return 'series';
  return 'live';
}

function parseExtinfDuration(raw: string): number {
  const match = /#EXTINF:\s*(-?\d+)/.exec(raw);
  return match ? Number(match[1]) : -1;
}

/** iptv-playlist-parser's typings omit some tvg-* attrs; read them from raw. */
function extinfAttr(raw: string, name: string): string | undefined {
  return new RegExp(`${name}="([^"]*)"`).exec(raw)?.[1] || undefined;
}

export function parsePlaylistString(content: string): Channel[] {
  const parsed = parseM3u(content);
  return parsed.items.map((item) => {
    const title = item.name;
    const group = item.group.title ?? '';
    const contentType = classifyContentType(item.url, group);
    return {
      title,
      url: item.url,
      group,
      tvgId: item.tvg.id || undefined,
      tvgName: item.tvg.name || undefined,
      tvgLogo: item.tvg.logo || undefined,
      tvgCountry: extinfAttr(item.raw, 'tvg-country'),
      tvgLanguage: extinfAttr(item.raw, 'tvg-language'),
      tvgUrl: item.tvg.url || undefined,
      duration: parseExtinfDuration(item.raw),
      userAgent: item.http?.['user-agent'] || undefined,
      referer: item.http?.referrer || undefined,
      contentType,
      // Like Rust, adult flags are group-based and applied only after a
      // fetch-and-import (see fetchAndImportPlaylist), never at parse time.
      isAdult: false,
      channelId: getRawChannelId(item),
    } satisfies Channel;
  });
}

// ── Minimal XMLTV parsing (programme elements only) ──

/**
 * Mirrors m3u-epg/src/timestamp.rs: full and date-only stamps are valid,
 * anything else is an error — the Rust parser fails the whole document on a
 * malformed timestamp rather than silently storing garbage.
 */
function parseXmltvTimestamp(value: string): number {
  const match =
    /^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(\d{2})(?:\s*([+-])(\d{2})(\d{2}))?)?$/.exec(
      value.trim(),
    );
  if (!match) throw new Error(`Invalid XMLTV timestamp: ${value}`);
  const [, y, mo, d, h = '0', mi = '0', s = '0', sign, offH, offM] = match;
  let epoch = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s) / 1000;
  if (sign) {
    const offset = (+offH * 60 + +offM) * 60;
    epoch += sign === '+' ? -offset : offset;
  }
  return epoch;
}

/** The Rust parser unescapes text nodes via quick-xml's unescape(). */
function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&');
}

function extractTag(block: string, tag: string): string | undefined {
  // Like the Rust parser: plain text is entity-unescaped, CDATA is literal.
  const match = new RegExp(
    `<${tag}[^>]*>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))</${tag}>`,
  ).exec(block);
  if (!match) return undefined;
  return match[1] != null ? match[1].trim() : unescapeXml(match[2]).trim();
}

export function parseXmltvString(content: string): EpgProgramme[] {
  const programmes: EpgProgramme[] = [];
  const regex = /<programme\s([^>]*)>([\s\S]*?)<\/programme>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const [, attrs, body] = match;
    const attr = (name: string) => new RegExp(`${name}="([^"]*)"`).exec(attrs)?.[1];
    const channelId = attr('channel');
    const start = attr('start');
    const stop = attr('stop');
    const title = extractTag(body, 'title');
    if (!channelId || !start || !stop || !title) continue;
    programmes.push({
      channelId,
      title,
      start: parseXmltvTimestamp(start),
      stop: parseXmltvTimestamp(stop),
      description: extractTag(body, 'desc'),
      category: extractTag(body, 'category'),
      subTitle: extractTag(body, 'sub-title'),
      episodeNum: extractTag(body, 'episode-num'),
    });
  }
  return programmes;
}

// ── Channel querying helpers ──

interface StoredChannel extends Channel {
  playlistId: string;
  /** Insertion order, mirrors the Rust rowid used for playlist-order sorting. */
  position: number;
}

function seriesKey(channel: Channel): string {
  // Mirrors the Rust insert pipeline: strip_episode_info(COALESCE(tvg_name,
  // title)) — series-utils.ts documents itself as the TS port of that SQL
  // function, so reuse it instead of keeping a third copy of the rules.
  const name = channel.tvgName?.trim() ? channel.tvgName : channel.title;
  return stripEpisodeInfo(name);
}

function applyChannelFilter(channels: StoredChannel[], filter?: ChannelFilter): StoredChannel[] {
  let result = channels;
  if (filter?.playlistId) result = result.filter((c) => c.playlistId === filter.playlistId);
  if (filter?.groups?.length) {
    const groups = new Set(filter.groups);
    result = result.filter((c) => groups.has(c.group));
  }
  if (filter?.contentType) result = result.filter((c) => c.contentType === filter.contentType);
  if (filter?.excludeAdult) result = result.filter((c) => !c.isAdult);
  if (filter?.search) {
    // Rust: `title LIKE ? OR group_name LIKE ?` (m3u-db operations.rs) — the
    // tvg fields are not searched.
    const needle = filter.search.toLowerCase();
    result = result.filter(
      (c) => c.title.toLowerCase().includes(needle) || c.group.toLowerCase().includes(needle),
    );
  }

  result = [...result];
  const direction = filter?.sortOrder === 'desc' ? -1 : 1;
  const sortBy = filter?.sortBy;
  if (sortBy && sortBy !== 'random') {
    const key = (c: StoredChannel) =>
      (sortBy === 'group' ? c.group : sortBy === 'tvgName' ? (c.tvgName ?? c.title) : c.title) ??
      '';
    result.sort((a, b) => direction * key(a).localeCompare(key(b)));
  }
  if (filter?.favoriteIds?.length) {
    const favorites = new Set(filter.favoriteIds);
    result.sort((a, b) => Number(favorites.has(b.channelId)) - Number(favorites.has(a.channelId)));
  }
  return result;
}

function paginate<T>(items: T[], limit?: number, offset?: number): T[] {
  const start = offset ?? 0;
  return items.slice(start, limit != null ? start + limit : undefined);
}

function stripStored(channel: StoredChannel): Channel {
  const { playlistId: _playlistId, position: _position, ...rest } = channel;
  return rest;
}

// ── Database fake ──

export class Database {
  /** One shared instance per path, mirroring connections to the same file. */
  static __instances = new Map<string, Database>();

  private playlists = new Map<string, PlaylistMetadata>();
  private channels: StoredChannel[] = [];
  private metadata: ChannelMetadata[] = [];
  private epgSources = new Map<string, EpgSource>();
  private programmes = new Map<string, EpgProgramme[]>(); // keyed by sourceId
  private nextPosition = 1;

  static async open(path: string): Promise<Database> {
    let instance = Database.__instances.get(path);
    if (!instance) {
      instance = new Database();
      Database.__instances.set(path, instance);
    }
    return instance;
  }

  static async openInMemory(): Promise<Database> {
    // Register under a unique key so __resetM3uFake clears these too.
    const db = new Database();
    Database.__instances.set(`:memory:#${Database.__instances.size}`, db);
    return db;
  }

  // ── Test seeding helpers ──

  __clear(): void {
    this.playlists.clear();
    this.channels = [];
    this.metadata = [];
    this.epgSources.clear();
    this.programmes.clear();
    this.nextPosition = 1;
  }

  __seedChannels(playlistId: string, channels: Channel[]): void {
    for (const channel of channels) {
      this.channels.push({ ...channel, playlistId, position: this.nextPosition++ });
    }
  }

  __seedMetadata(metadata: ChannelMetadata[]): void {
    this.metadata.push(...metadata);
  }

  __seedProgrammes(sourceId: string, programmes: EpgProgramme[]): void {
    this.programmes.set(sourceId, [...(this.programmes.get(sourceId) ?? []), ...programmes]);
  }

  private allProgrammes(): EpgProgramme[] {
    return [...this.programmes.values()].flat();
  }

  // ── Playlists ──

  async createPlaylist(metadata: PlaylistMetadata): Promise<void> {
    this.playlists.set(metadata.id, { ...metadata });
  }

  async getPlaylist(id: string): Promise<PlaylistMetadata | null> {
    return this.playlists.get(id) ?? null;
  }

  async getAllPlaylists(): Promise<PlaylistMetadata[]> {
    return [...this.playlists.values()];
  }

  async updatePlaylist(
    id: string,
    updates: { name?: string; url?: string; username?: string; password?: string },
  ): Promise<void> {
    const existing = this.playlists.get(id);
    if (!existing) throw new Error(`Playlist not found: ${id}`);
    this.playlists.set(id, { ...existing, ...updates, updatedAt: new Date().toISOString() });
  }

  async deletePlaylist(id: string): Promise<void> {
    this.playlists.delete(id);
    this.channels = this.channels.filter((c) => c.playlistId !== id);
  }

  // ── Channels ──

  async getChannels(filter?: ChannelFilter): Promise<Channel[]> {
    const filtered = applyChannelFilter(this.channels, filter);
    return paginate(filtered, filter?.limit, filter?.offset).map(stripStored);
  }

  async getChannelsWithCount(filter?: ChannelFilter): Promise<ChannelsWithCount> {
    const filtered = applyChannelFilter(this.channels, filter);
    return {
      channels: paginate(filtered, filter?.limit, filter?.offset).map(stripStored),
      totalCount: filtered.length,
    };
  }

  async getChannelById(playlistId: string, channelId: string): Promise<Channel | null> {
    const found = this.channels.find(
      (c) => c.playlistId === playlistId && c.channelId === channelId,
    );
    return found ? stripStored(found) : null;
  }

  async deleteChannelsByPlaylist(playlistId: string): Promise<void> {
    this.channels = this.channels.filter((c) => c.playlistId !== playlistId);
  }

  async clearChannels(): Promise<void> {
    this.channels = [];
  }

  // ── Groups ──

  async getGroups(): Promise<string[]> {
    return [...new Set(this.channels.map((c) => c.group))];
  }

  async getGroupsByPlaylist(playlistId: string): Promise<string[]> {
    return [...new Set(this.channels.filter((c) => c.playlistId === playlistId).map((c) => c.group))];
  }

  async getGroupsWithCounts(): Promise<GroupCount[]> {
    return this.groupCounts(this.channels);
  }

  async getGroupsWithCountsByPlaylist(
    playlistId: string,
    contentType?: ContentType,
    excludeAdult?: boolean,
  ): Promise<GroupCount[]> {
    let channels = this.channels.filter((c) => c.playlistId === playlistId);
    if (contentType) channels = channels.filter((c) => c.contentType === contentType);
    if (excludeAdult) channels = channels.filter((c) => !c.isAdult);
    return this.groupCounts(channels);
  }

  private groupCounts(channels: StoredChannel[]): GroupCount[] {
    const groups = new Map<string, GroupCount>();
    for (const channel of channels) {
      const entry = groups.get(channel.group);
      if (entry) {
        entry.count += 1;
        entry.firstPosition = Math.min(entry.firstPosition, channel.position);
      } else {
        groups.set(channel.group, { name: channel.group, count: 1, firstPosition: channel.position });
      }
    }
    return [...groups.values()];
  }

  // ── Counts ──

  async countChannels(): Promise<number> {
    return this.channels.length;
  }

  async countChannelsByPlaylist(playlistId: string): Promise<number> {
    return this.channels.filter((c) => c.playlistId === playlistId).length;
  }

  async countByContentType(type: ContentType): Promise<number> {
    return this.channels.filter((c) => c.contentType === type).length;
  }

  // ── Series ──

  async getSeriesList(filter?: SeriesFilter): Promise<SeriesListResult> {
    let episodes = this.channels.filter((c) => c.contentType === 'series');
    if (filter?.playlistId) episodes = episodes.filter((c) => c.playlistId === filter.playlistId);
    if (filter?.groups?.length) {
      const groups = new Set(filter.groups);
      episodes = episodes.filter((c) => groups.has(c.group));
    }
    if (filter?.excludeAdult) episodes = episodes.filter((c) => !c.isAdult);

    const seriesMap = new Map<string, SeriesInfo>();
    for (const episode of episodes) {
      const name = seriesKey(episode);
      const entry = seriesMap.get(name);
      if (entry) {
        entry.episodeCount += 1;
      } else {
        seriesMap.set(name, {
          seriesName: name,
          poster: episode.tvgLogo,
          groupName: episode.group,
          episodeCount: 1,
        });
      }
    }

    let series = [...seriesMap.values()];
    if (filter?.search) {
      const needle = filter.search.toLowerCase();
      series = series.filter((s) => s.seriesName.toLowerCase().includes(needle));
    }
    const direction = filter?.sortOrder === 'desc' ? -1 : 1;
    if (!filter?.random) {
      series.sort((a, b) => direction * a.seriesName.localeCompare(b.seriesName));
    }
    if (filter?.favoriteNames?.length) {
      const favorites = new Set(filter.favoriteNames);
      series.sort((a, b) => Number(favorites.has(b.seriesName)) - Number(favorites.has(a.seriesName)));
    }
    return {
      series: paginate(series, filter?.limit, filter?.offset),
      totalCount: series.length,
    };
  }

  async getSeriesEpisodes(
    playlistId: string,
    seriesName: string,
    groupName: string,
  ): Promise<Channel[]> {
    return this.channels
      .filter(
        (c) =>
          c.playlistId === playlistId &&
          c.contentType === 'series' &&
          c.group === groupName &&
          seriesKey(c) === seriesName,
      )
      .map(stripStored);
  }

  // ── Recommendations (deterministic: first N matching) ──

  async getMovieRecommendations(
    playlistId: string,
    excludeAdult: boolean,
    limit: number,
  ): Promise<Channel[]> {
    return this.getChannels({ playlistId, contentType: 'movie', excludeAdult, limit });
  }

  async regenerateMovieRecommendations(
    playlistId: string,
    excludeAdult: boolean,
    limit: number,
  ): Promise<Channel[]> {
    return this.getMovieRecommendations(playlistId, excludeAdult, limit);
  }

  async getSeriesRecommendations(
    playlistId: string,
    excludeAdult: boolean,
    limit: number,
  ): Promise<SeriesInfo[]> {
    const { series } = await this.getSeriesList({ playlistId, excludeAdult, limit });
    return series;
  }

  async regenerateSeriesRecommendations(
    playlistId: string,
    excludeAdult: boolean,
    limit: number,
  ): Promise<SeriesInfo[]> {
    return this.getSeriesRecommendations(playlistId, excludeAdult, limit);
  }

  // ── Metadata ──

  async getMetadataByStreamId(playlistId: string, streamId: number): Promise<ChannelMetadata | null> {
    return (
      this.metadata.find((m) => m.playlistId === playlistId && m.streamId === streamId) ?? null
    );
  }

  async getMetadataByChannelId(
    playlistId: string,
    channelId: string,
  ): Promise<ChannelMetadata | null> {
    return (
      this.metadata.find((m) => m.playlistId === playlistId && m.channelId === channelId) ?? null
    );
  }

  async getMetadataBySeriesName(
    playlistId: string,
    seriesName: string,
  ): Promise<ChannelMetadata | null> {
    return (
      this.metadata.find((m) => m.playlistId === playlistId && m.seriesName === seriesName) ?? null
    );
  }

  // ── Import ──

  async importFromString(content: string): Promise<number> {
    return this.importFromStringWithPlaylist(content, '');
  }

  async importFromStringWithPlaylist(content: string, playlistId: string): Promise<number> {
    const channels = parsePlaylistString(content);
    this.__seedChannels(playlistId, channels);
    return channels.length;
  }

  async fetchAndImportPlaylist(
    playlistId: string,
    url: string,
    _credentials?: Credentials,
  ): Promise<number> {
    const content = remoteM3u.get(url);
    if (content == null) {
      const error = `No fixture registered for URL: ${url} (use __registerRemoteM3u)`;
      emitImportError({ playlistId, error });
      throw new Error(error);
    }

    // Mirror the Rust fetch path's progress phases (m3u-ffi database.rs).
    emitImportProgress({ playlistId, phase: 'downloading', current: 0, total: 1 });
    await this.deleteChannelsByPlaylist(playlistId);
    emitImportProgress({ playlistId, phase: 'importing', current: 0, total: 1 });
    const count = await this.importFromStringWithPlaylist(content, playlistId);
    emitImportProgress({ playlistId, phase: 'processing', current: 0, total: 1 });

    // Group-based adult flags are applied here only, like the Rust fetch path.
    for (const channel of this.channels) {
      if (channel.playlistId === playlistId && !channel.isAdult && isAdultGroup(channel.group)) {
        channel.isAdult = true;
      }
    }

    const playlist = this.playlists.get(playlistId);
    if (playlist) {
      playlist.channelCount = count;
      playlist.lastFetchedAt = new Date().toISOString();
    }

    emitImportProgress({ playlistId, phase: 'complete', current: 1, total: 1 });
    emitImportComplete({ playlistId, channelCount: count });
    return count;
  }

  // ── EPG sources ──

  async upsertEpgSource(source: EpgSource): Promise<void> {
    this.epgSources.set(source.id, { ...source });
  }

  async getAllEpgSources(): Promise<EpgSource[]> {
    return [...this.epgSources.values()];
  }

  async getEpgSourcesByPlaylist(playlistId: string): Promise<EpgSource[]> {
    return [...this.epgSources.values()].filter((s) => s.playlistId === playlistId);
  }

  async deleteEpgSource(sourceId: string): Promise<void> {
    this.epgSources.delete(sourceId);
    this.programmes.delete(sourceId);
  }

  async detectEpgSources(playlistId: string): Promise<EpgSource[]> {
    const urls = await this.getEpgUrlsForPlaylist(playlistId);
    const detected: EpgSource[] = urls.map((url) => ({
      id: `auto:${url}`,
      url,
      autoDetected: true,
      programmeCount: 0,
      playlistId,
    }));
    for (const source of detected) {
      if (!this.epgSources.has(source.id)) this.epgSources.set(source.id, source);
    }
    return detected;
  }

  async getEpgUrlsForPlaylist(playlistId: string): Promise<string[]> {
    return [
      ...new Set(
        this.channels
          .filter((c) => c.playlistId === playlistId && c.tvgUrl)
          .map((c) => c.tvgUrl as string),
      ),
    ];
  }

  async fetchAndImportEpg(sourceId: string, url: string): Promise<number> {
    const content = remoteXmltv.get(url);
    if (content == null) {
      throw new Error(`No fixture registered for URL: ${url} (use __registerRemoteXmltv)`);
    }
    const programmes = parseXmltvString(content);
    this.programmes.set(sourceId, programmes);
    const source = this.epgSources.get(sourceId);
    if (source) {
      source.programmeCount = programmes.length;
      source.lastFetchedAt = new Date().toISOString();
    }
    return programmes.length;
  }

  // ── EPG programmes ──

  async getCurrentProgramme(channelId: string, now?: number): Promise<EpgProgramme | null> {
    const at = now ?? Math.floor(Date.now() / 1000);
    return (
      this.allProgrammes().find((p) => p.channelId === channelId && p.start <= at && p.stop > at) ??
      null
    );
  }

  async getNextProgramme(channelId: string, now?: number): Promise<EpgProgramme | null> {
    const at = now ?? Math.floor(Date.now() / 1000);
    return (
      this.allProgrammes()
        .filter((p) => p.channelId === channelId && p.start > at)
        .sort((a, b) => a.start - b.start)[0] ?? null
    );
  }

  async getChannelSchedule(channelId: string, from: number, to: number): Promise<EpgProgramme[]> {
    return this.allProgrammes()
      .filter((p) => p.channelId === channelId && p.stop > from && p.start < to)
      .sort((a, b) => a.start - b.start);
  }

  async getCurrentProgrammesForChannels(
    channelIds: string[],
    now?: number,
  ): Promise<EpgProgramme[]> {
    const results = await Promise.all(channelIds.map((id) => this.getCurrentProgramme(id, now)));
    return results.filter((p): p is EpgProgramme => p !== null);
  }

  async getProgrammesForChannels(
    channelIds: string[],
    from: number,
    to: number,
  ): Promise<ChannelProgrammes[]> {
    const groups = await Promise.all(
      channelIds.map(async (channelId) => ({
        channelId,
        programmes: await this.getChannelSchedule(channelId, from, to),
      })),
    );
    return groups.filter((g) => g.programmes.length > 0);
  }

  async searchProgrammes(
    query: string,
    options?: { from?: number; to?: number; category?: string; limit?: number; offset?: number },
  ): Promise<GroupedProgrammesResult> {
    const needle = query.toLowerCase();
    let matches = this.allProgrammes().filter((p) => p.title.toLowerCase().includes(needle));
    if (options?.from != null) matches = matches.filter((p) => p.stop > options.from!);
    if (options?.to != null) matches = matches.filter((p) => p.start < options.to!);
    if (options?.category) matches = matches.filter((p) => p.category === options.category);

    const limit = options?.limit ?? matches.length;
    const offset = options?.offset ?? 0;
    const page = matches.slice(offset, offset + limit);

    const byChannel = new Map<string, EpgProgramme[]>();
    for (const programme of page) {
      byChannel.set(programme.channelId, [...(byChannel.get(programme.channelId) ?? []), programme]);
    }
    return {
      groups: [...byChannel.entries()].map(([channelId, programmes]) => ({
        channelId,
        programmes: programmes.sort((a, b) => a.start - b.start),
      })),
      hasMore: offset + limit < matches.length,
    };
  }

  async cleanupExpiredProgrammes(cutoff: number): Promise<number> {
    let removed = 0;
    for (const [sourceId, programmes] of this.programmes) {
      const kept = programmes.filter((p) => p.stop >= cutoff);
      removed += programmes.length - kept.length;
      this.programmes.set(sourceId, kept);
    }
    return removed;
  }

  // ── Lifecycle ──

  async close(): Promise<void> {}

  getHandle(): number {
    return 0;
  }
}

// ── SportsDatabase fake (favorites in memory, network-backed queries empty) ──

export class SportsDatabase {
  static __instances = new Map<string, SportsDatabase>();

  private favoriteTeams: Team[] = [];
  __competitions: Competition[] = [];
  __fixtures: Fixture[] = [];
  __standings: Standing[] = [];

  static async open(path: string): Promise<SportsDatabase> {
    let instance = SportsDatabase.__instances.get(path);
    if (!instance) {
      instance = new SportsDatabase();
      SportsDatabase.__instances.set(path, instance);
    }
    return instance;
  }

  __clear(): void {
    this.favoriteTeams = [];
    this.__competitions = [];
    this.__fixtures = [];
    this.__standings = [];
  }

  async getCompetitions(_maxAgeSecs = 86400): Promise<Competition[]> {
    return this.__competitions;
  }

  async getCompetitionTeams(_compId: number, _maxAgeSecs = 86400): Promise<TeamSearchResult[]> {
    return [];
  }

  async searchTeams(query: string): Promise<TeamSearchResult[]> {
    const needle = query.toLowerCase();
    return this.favoriteTeams
      .filter((t) => t.name.toLowerCase().includes(needle))
      .map(({ providerId, provider, name, shortName, tla, crestUrl }) => ({
        providerId,
        provider,
        name,
        shortName,
        tla,
        crestUrl,
      }));
  }

  async addFavoriteTeam(team: Team): Promise<void> {
    await this.removeFavoriteTeam(team.provider, team.providerId);
    this.favoriteTeams.push({ ...team });
  }

  async removeFavoriteTeam(provider: string, providerId: number): Promise<void> {
    this.favoriteTeams = this.favoriteTeams.filter(
      (t) => !(t.provider === provider && t.providerId === providerId),
    );
  }

  async getFavoriteTeams(): Promise<Team[]> {
    return [...this.favoriteTeams];
  }

  async getTeamFixtures(
    teamId: number,
    _from: string,
    _to: string,
    fromTs: number,
    toTs: number,
    _maxAgeSecs: number,
  ): Promise<Fixture[]> {
    return this.__fixtures.filter(
      (f) =>
        (f.homeTeamId === teamId || f.awayTeamId === teamId) &&
        f.kickoffTime >= fromTs &&
        f.kickoffTime <= toTs,
    );
  }

  async getStandings(compId: number): Promise<Standing[]> {
    return this.__standings.filter((s) => s.competitionId === compId);
  }

  async getScorers(compId: number): Promise<TopScorers> {
    return { competitionId: compId, competitionName: '', season: 0, scorers: [] };
  }

  async findBroadcastsForFixture(): Promise<never[]> {
    return [];
  }

  async getAllCachedCompetitionTeams(): Promise<TeamSearchResult[]> {
    return [];
  }

  async cleanupOldFixtures(cutoff: number): Promise<number> {
    const before = this.__fixtures.length;
    this.__fixtures = this.__fixtures.filter((f) => f.kickoffTime >= cutoff);
    return before - this.__fixtures.length;
  }

  async fetchAndStoreTvChannels(_countryCode: string): Promise<number> {
    return 0;
  }

  async fetchAndStoreFixtureBroadcasts(_fixtureProviderId: number): Promise<number> {
    return 0;
  }

  async getFixtureBroadcasts(_fixtureProviderId: number, _countryCode: string): Promise<TvChannel[]> {
    return [];
  }

  async findPlayableChannelsForFixture(): Promise<RankedBroadcast[]> {
    return [];
  }

  async close(): Promise<void> {}
}

// ── Module-level exports the app imports ──

export async function resolveRedirects(url: string): Promise<string> {
  return url;
}

// Import-event plumbing: the real native module streams progress/complete/
// error events that playlist-store and import-progress-store consume, so the
// fake emits them from fetchAndImportPlaylist instead of swallowing them.

const importProgressListeners = new Set<(event: ImportProgressEvent) => void>();
const importCompleteListeners = new Set<(event: ImportCompleteEvent) => void>();
const importErrorListeners = new Set<(event: ImportErrorEvent) => void>();

function emitImportProgress(event: ImportProgressEvent): void {
  importProgressListeners.forEach((listener) => listener(event));
}

function emitImportComplete(event: ImportCompleteEvent): void {
  importCompleteListeners.forEach((listener) => listener(event));
}

function emitImportError(event: ImportErrorEvent): void {
  importErrorListeners.forEach((listener) => listener(event));
}

function subscribe<T>(listeners: Set<(event: T) => void>, listener: (event: T) => void) {
  listeners.add(listener);
  return {
    remove() {
      listeners.delete(listener);
    },
  };
}

export function addImportProgressListener(
  listener: (event: ImportProgressEvent) => void,
): { remove(): void } {
  return subscribe(importProgressListeners, listener);
}

export function addImportCompleteListener(
  listener: (event: ImportCompleteEvent) => void,
): { remove(): void } {
  return subscribe(importCompleteListeners, listener);
}

export function addImportErrorListener(
  listener: (event: ImportErrorEvent) => void,
): { remove(): void } {
  return subscribe(importErrorListeners, listener);
}

export function parsePlaylistFile(_path: string): Promise<Channel[]> {
  return Promise.resolve([]);
}
