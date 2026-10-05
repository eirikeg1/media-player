import { redactCredentials } from '@/lib/url-utils';
import { RustChannelService } from '@/services/rust-channel-service';
import type { PlaylistCredentials } from '@/types/playlist.types';
import { M3uParserError, addImportProgressListener } from 'expo-m3u-parser';

import { useImportProgressStore } from './import-progress-store';

const NO_CHANNELS_MESSAGE = 'No channels found in playlist. Please verify the M3U format.';

/**
 * Raised when the native backend is already importing the playlist we asked it
 * to import — a duplicate request, not a failure of the running import.
 */
export class ImportAlreadyRunningError extends Error {
  constructor() {
    super('This playlist is already being imported. Please wait for it to finish.');
    this.name = 'ImportAlreadyRunningError';
  }
}

/**
 * Whether an error is the native backend refusing a duplicate import.
 *
 * The module classifies its own failures, so the code decides it. The message
 * match stays as a fallback for an error that reached us without one — an older
 * native build, or a rejection raised before the coded path.
 */
function isAlreadyInProgress(error: unknown): boolean {
  if (error instanceof M3uParserError && error.code) return error.code === 'ALREADY_IN_PROGRESS';
  const message = error instanceof Error ? error.message : String(error);
  return /already in progress|already running|AlreadyInProgress/i.test(message);
}

/** Everything a fetch-and-import needs, whether it adds, refreshes or edits. */
export interface ImportRequest {
  playlistId: string;
  name: string;
  url: string;
  credentials?: PlaylistCredentials;
}

/**
 * Run one playlist import, owning its progress lifecycle end to end.
 *
 * The progress entry is started before the native call and removed once the
 * import settles — including on failure, so a broken import can never leave a
 * card stuck "importing" and make the scheduler skip it forever.
 *
 * A call that finds an entry already there joins a run someone else is tracking:
 * it neither resets that run's progress nor removes its entry, because the entry
 * belongs to the caller that created it.
 *
 * Needs no store to be initialised: the progress store is plain memory, so this
 * runs the same in a headless background launch as in the app.
 *
 * @throws ImportAlreadyRunningError when an import for this playlist is already running
 * @throws Error when the download fails or the playlist yields no channels
 */
export async function runImport({
  playlistId,
  name,
  url,
  credentials,
}: ImportRequest): Promise<number> {
  const progress = () => useImportProgressStore.getState();

  console.log('[PlaylistStore] Importing playlist:', playlistId, redactCredentials(url));
  const importStart = Date.now();
  const ownsProgress = progress().startImport(playlistId);
  if (ownsProgress) {
    progress().updateProgress(playlistId, 'downloading', 0, 1);
  }

  const progressSubscription = addImportProgressListener((event) => {
    progress().updateProgress(event.playlistId, event.phase, event.current, event.total);
  });

  try {
    const channelCount = await RustChannelService.fetchAndImportPlaylist(
      playlistId,
      name,
      url,
      credentials,
    );
    if (channelCount === 0) {
      throw new Error(NO_CHANNELS_MESSAGE);
    }

    console.log(
      `[PlaylistStore] Imported ${channelCount} channels (${Date.now() - importStart}ms)`,
    );
    progress().updateProgress(playlistId, 'complete', 1, 1);
    if (ownsProgress) progress().finishImport(playlistId);
    return channelCount;
  } catch (error) {
    // A duplicate rejection means someone else's run is still going: its entry
    // describes that run, so only an entry this call created may be removed —
    // otherwise the running import's progress would vanish from the UI and every
    // gate that reads it would think nothing is importing.
    if (ownsProgress) progress().finishImport(playlistId);
    if (isAlreadyInProgress(error)) {
      throw new ImportAlreadyRunningError();
    }
    throw error;
  } finally {
    progressSubscription.remove();
  }
}
