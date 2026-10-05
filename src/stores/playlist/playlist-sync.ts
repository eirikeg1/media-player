import { playlistRepository } from '@/db/playlist-repository';
import { EpgService, isEpgFetchComplete } from '@/services/epg-service';
import type { Playlist } from '@/types/playlist.types';

import { publishCatalogueRefresh } from './catalogue-events';
import { isAnyImportRunning } from './import-progress-store';
import { runImport } from './run-import';

/**
 * The one implementation of "sync this playlist" and "sync its guide".
 *
 * Every path that refreshes an existing playlist's catalogue goes through here —
 * the store's refresh action, the foreground schedulers and the OS background
 * task — so they record the same stamps under the same rules.
 *
 * Built on the repository, not the store: a background wake can start the app
 * headless, with no store initialised and nothing in it to read. The stamps are
 * written to the row, and the refresh is announced through `catalogue-events`;
 * the playlist store (when it is alive in this process) patches its copy from
 * that announcement, as does every cache derived from the catalogue.
 */

/**
 * How long a sync may be counted as running. Comfortably beyond the native
 * import's own watchdog (30 minutes), so it only stops counting a promise that
 * will never settle — which would otherwise hold every gate below closed for
 * the rest of the process.
 */
const STALE_SYNC_MS = 45 * 60_000;

/** Start time of every sync in flight, keyed by a token per call. */
const syncsInFlight = new Map<symbol, number>();

async function tracked<T>(work: () => Promise<T>): Promise<T> {
  const token = Symbol('catalogue-sync');
  syncsInFlight.set(token, Date.now());
  try {
    return await work();
  } finally {
    syncsInFlight.delete(token);
  }
}

/**
 * Whether any catalogue download is running in this process: a playlist import
 * (whoever started it) or a sync made through this module, guide downloads
 * included.
 *
 * The provider's account usually allows a single connection, so every
 * automatic sync stands down while this is true rather than queueing a second
 * download behind the first.
 */
export function isCatalogueSyncRunning(): boolean {
  if (isAnyImportRunning()) return true;
  const now = Date.now();
  for (const startedAt of syncsInFlight.values()) {
    if (now - startedAt < STALE_SYNC_MS) return true;
  }
  return false;
}

async function requirePlaylist(playlistId: string): Promise<Playlist> {
  const playlist = await playlistRepository.getById(playlistId);
  if (!playlist) throw new Error('Playlist not found');
  return playlist;
}

/**
 * Re-import a stored playlist's channels and record `channelCount` and
 * `lastFetchedAt`.
 *
 * @returns The row as stored afterwards
 * @throws ImportAlreadyRunningError when this playlist is already importing
 * @throws Error when the playlist is unknown, the download fails or it yields no channels
 */
export function syncPlaylistChannels(playlistId: string): Promise<Playlist> {
  return tracked(async () => {
    const playlist = await requirePlaylist(playlistId);
    const channelCount = await runImport({
      playlistId,
      name: playlist.name,
      url: playlist.url,
      credentials: playlist.credentials,
    });

    const updated = await playlistRepository.update(playlistId, {
      channelCount,
      lastFetchedAt: new Date(),
    });
    publishCatalogueRefresh({ part: 'channels', playlist: updated });
    return updated;
  });
}

/**
 * Download a stored playlist's programme guide and record `lastEpgFetchedAt` —
 * only once the guide is as current as its sources allow. Stamping a download
 * that failed would hide the missing guide until the next full interval; the
 * rejection hands the retry to the caller instead.
 *
 * @returns The row as stored afterwards
 * @throws Error when the playlist is unknown or every guide source failed
 */
export function syncPlaylistGuide(playlistId: string): Promise<Playlist> {
  return tracked(async () => {
    const playlist = await requirePlaylist(playlistId);
    const result = await EpgService.detectAndFetchEpgSources(playlistId, playlist.epgUrl);
    if (!isEpgFetchComplete(result)) {
      throw new Error(`all ${result.failed} EPG source(s) failed to download`);
    }

    const updated = await playlistRepository.update(playlistId, { lastEpgFetchedAt: new Date() });
    publishCatalogueRefresh({ part: 'guide', playlist: updated });
    return updated;
  });
}
