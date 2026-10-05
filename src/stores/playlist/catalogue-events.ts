import type { Playlist } from '@/types/playlist.types';

/**
 * "A playlist's catalogue was just refreshed" — announced by whichever path did
 * the refresh (an add, an edit, a manual refresh, a scheduler, the OS
 * background task) and heard by everything that keeps a copy derived from it:
 * the playlist store's own list, the first-page cache, the sports channel
 * matches.
 *
 * A leaf module, like `current-user-context`: the code that refreshes a
 * catalogue lives under `stores/` and must not reach into the features that
 * cache on top of it, so the features subscribe here instead of being called.
 */

/** Which half of the catalogue was refreshed. */
export type CataloguePart = 'channels' | 'guide';

export interface CatalogueRefresh {
  part: CataloguePart;
  /** The playlist row as stored after the refresh was recorded. */
  playlist: Playlist;
}

type CatalogueListener = (event: CatalogueRefresh) => void;

const listeners = new Set<CatalogueListener>();

/**
 * Be told after every successful catalogue refresh. Returns the unsubscribe
 * function. Listeners run synchronously, in subscription order.
 */
export function subscribeToCatalogueRefreshes(listener: CatalogueListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Announce a successful refresh. A listener that throws is logged and skipped:
 * the refresh it heard about has already happened, and one broken cache must
 * not stop the others from hearing of it.
 */
export function publishCatalogueRefresh(event: CatalogueRefresh): void {
  for (const listener of [...listeners]) {
    try {
      listener(event);
    } catch (err) {
      console.warn('[CatalogueEvents] A listener failed:', err);
    }
  }
}
