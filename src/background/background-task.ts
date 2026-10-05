import { isChannelSyncDue, isGuideSyncDue } from '@/lib/sync-intervals';
import type { Playlist } from '@/types/playlist.types';

/**
 * The app's one OS background task: what a wake does, in priority order.
 *
 * 1. re-import every playlist whose channel list is due,
 * 2. download the guide of every playlist whose guide is due,
 * 3. the sports refresh, which decides for itself whether it is due.
 *
 * The playlist and the guide are the slow, important things — fresh channel
 * titles and programmes are what lets the sports tab find the channel showing a
 * match — so they go first, and sports gets what is left. Each step (and each
 * playlist inside one) is isolated: a failure is logged and counted, never a
 * reason to skip what comes after it.
 *
 * Pure and injectable: the adapter supplies the platform, the tests supply
 * fakes.
 */

/**
 * The time the task allows itself, measured from the moment its JS starts.
 *
 * On Android the task runs inside a WorkManager worker (expo-background-task
 * enqueues a `CoroutineWorker`), and the platform stops a regular worker ten
 * minutes after it starts — only "long-running" foreground workers may run
 * longer. The ten minutes include the headless JS start-up that precedes this
 * code, and work that is stopped mid-import is work wasted, so the budget keeps
 * two of them in hand. iOS gives no figure at all ("can run for minutes, but
 * the system can interrupt the process at any time"), so the same budget is
 * the best available bound there too.
 */
export const TASK_BUDGET_MS = 8 * 60_000;

/**
 * When the task reports back whatever is still running.
 *
 * The budget only decides whether a unit may *start*; a unit that then runs
 * long (a slow panel, a download that never settles) would carry the task past
 * the platform's ten minutes. A worker stopped there is not merely one lost
 * wake: expo-background-task queues the next wake only after the task's promise
 * resolves, so a stopped worker ends the chain until the app is next opened.
 * Answering inside the limit keeps the wakes coming. The unit left running is
 * not cancelled — it still counts as a running sync for the next wake's guards,
 * and the import is transactional, so being cut off costs only the download.
 */
export const TASK_DEADLINE_MS = 9 * 60_000;

/**
 * What one unit of each step is assumed to need. A unit is only started while
 * the budget left covers its estimate: an import the worker is stopped in the
 * middle of has cost a full download for nothing, while a unit that is skipped
 * stays due and runs at the next wake.
 *
 * A playlist import is a ~60 MB download plus the import, its metadata
 * enrichment calls and the search index, all through one panel connection; a
 * guide download is a single XMLTV file; the sports refresh is a handful of
 * paced provider requests.
 */
export const STEP_ESTIMATE_MS = {
  channels: 4 * 60_000,
  guide: 2 * 60_000,
  sports: 60_000,
} as const;

export type SportsRefreshOutcome = 'ran' | 'skipped' | 'failed';

/** Everything the task touches, injected. */
export interface BackgroundTaskDeps {
  /** Epoch millis. The budget and due-ness are both measured on it. */
  now(): number;
  /**
   * Make the app database safe to use. A headless launch has run no boot
   * sequence, so the schema may be one migration behind this build.
   */
  prepareCatalogue(): Promise<void>;
  /** Every stored playlist, straight from the repository. */
  listPlaylists(): Promise<Playlist[]>;
  syncChannels(playlistId: string): Promise<unknown>;
  syncGuide(playlistId: string): Promise<unknown>;

  /** The app is on screen, so the foreground schedulers own syncing. */
  isAppActive(): boolean;
  /** A stream is playing (or paused in picture-in-picture) on the panel's connection. */
  hasPlaybackSession(): boolean;
  /** Some other catalogue download is already running in this process. */
  isCatalogueSyncRunning(): boolean;
  /** Whether the current connection is metered (mobile data, a metered hotspot). */
  isConnectionMetered(): Promise<boolean>;
  /**
   * The user's "sync on mobile data" choice, as mirrored for the task; off when
   * it was never saved.
   */
  allowsMeteredCatalogueSync(): Promise<boolean>;

  /** The sports refresh, governed by its own preference. Never throws. */
  refreshSports(): Promise<SportsRefreshOutcome>;
}

/** `failed` when any unit of work failed; nothing being due is `ok`. */
export type BackgroundTaskOutcome = 'ok' | 'failed';

const TAG = '[BackgroundTask]';

/**
 * Why the catalogue steps must not run right now, or null when they may.
 *
 * Only the catalogue steps are guarded: each reason is about the panel (its
 * single connection, or a 60 MB download nobody is watching), and the sports
 * refresh talks to a different host. Foreground syncing has none of these:
 * the user is there to see it.
 */
async function catalogueBlocker(deps: BackgroundTaskDeps): Promise<string | null> {
  try {
    // The awaited answer first, the synchronous ones last: nothing may yield
    // between asking "is a sync running" and starting one, or a foreground
    // scheduler tick could slip in between and both would import.
    const meteredAndOff =
      (await deps.isConnectionMetered()) && !(await deps.allowsMeteredCatalogueSync());
    if (deps.isAppActive()) return 'the app is in the foreground, where its own schedulers sync';
    if (deps.hasPlaybackSession()) return 'a playback session holds the panel connection';
    if (deps.isCatalogueSyncRunning()) return 'another catalogue sync is already running';
    if (meteredAndOff) return 'the connection is metered and syncing on mobile data is off';
    return null;
  } catch (err) {
    console.warn(`${TAG} Could not check the catalogue guards:`, err);
    return 'the guards could not be checked';
  }
}

interface CatalogueStep {
  label: string;
  isDue(playlist: Playlist, now: number): boolean;
  estimateMs: number;
  run(playlistId: string): Promise<unknown>;
}

interface RunContext {
  deps: BackgroundTaskDeps;
  remainingMs(): number;
  failed: boolean;
}

/**
 * Run one catalogue step over every playlist it finds due, re-checking the
 * guards and the budget before each: an import takes minutes, and the user may
 * have opened the app or started a stream in the meantime.
 *
 * @returns false when a guard tripped, so the next catalogue step need not ask again
 */
async function runCatalogueStep(
  step: CatalogueStep,
  playlists: readonly Playlist[],
  ctx: RunContext,
): Promise<boolean> {
  const due = playlists.filter((playlist) => step.isDue(playlist, ctx.deps.now()));
  if (due.length === 0) {
    console.log(`${TAG} No ${step.label} due`);
    return true;
  }

  for (const [index, playlist] of due.entries()) {
    if (ctx.remainingMs() < step.estimateMs) {
      console.log(
        `${TAG} Skipping ${due.length - index} ${step.label}(s): ` +
          `${Math.round(ctx.remainingMs() / 1000)}s of budget left`,
      );
      return true;
    }
    const blocker = await catalogueBlocker(ctx.deps);
    if (blocker) {
      console.log(`${TAG} Skipping ${due.length - index} ${step.label}(s): ${blocker}`);
      return false;
    }

    try {
      console.log(`${TAG} Running ${step.label} for "${playlist.name}" (${playlist.id})`);
      await step.run(playlist.id);
    } catch (err) {
      ctx.failed = true;
      console.warn(`${TAG} ${step.label} failed for "${playlist.name}":`, err);
    }
  }
  return true;
}

/** The catalogue steps, in priority order. */
async function runCatalogue(ctx: RunContext): Promise<void> {
  const { deps } = ctx;
  const blocker = await catalogueBlocker(deps);
  if (blocker) {
    console.log(`${TAG} Skipping playlist and guide sync: ${blocker}`);
    return;
  }

  let playlists: Playlist[];
  try {
    await deps.prepareCatalogue();
    playlists = await deps.listPlaylists();
  } catch (err) {
    ctx.failed = true;
    console.warn(`${TAG} Could not read the playlists:`, err);
    return;
  }

  const steps: CatalogueStep[] = [
    {
      label: 'playlist sync',
      isDue: isChannelSyncDue,
      estimateMs: STEP_ESTIMATE_MS.channels,
      run: deps.syncChannels,
    },
    {
      label: 'guide sync',
      isDue: isGuideSyncDue,
      estimateMs: STEP_ESTIMATE_MS.guide,
      run: deps.syncGuide,
    },
  ];
  for (const step of steps) {
    if (!(await runCatalogueStep(step, playlists, ctx))) return;
  }
}

async function runSports(ctx: RunContext): Promise<void> {
  if (ctx.remainingMs() < STEP_ESTIMATE_MS.sports) {
    console.log(
      `${TAG} Skipping the sports refresh: ${Math.round(ctx.remainingMs() / 1000)}s of budget left`,
    );
    return;
  }
  try {
    if ((await ctx.deps.refreshSports()) === 'failed') ctx.failed = true;
  } catch (err) {
    ctx.failed = true;
    console.warn(`${TAG} Sports refresh failed:`, err);
  }
}

export async function runBackgroundTask(deps: BackgroundTaskDeps): Promise<BackgroundTaskOutcome> {
  const startedAt = deps.now();
  const ctx: RunContext = {
    deps,
    remainingMs: () => TASK_BUDGET_MS - (deps.now() - startedAt),
    failed: false,
  };

  const work = (async () => {
    await runCatalogue(ctx);
    await runSports(ctx);
  })();

  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<'deadline'>((resolve) => {
    deadlineTimer = setTimeout(() => resolve('deadline'), TASK_DEADLINE_MS);
  });
  try {
    const first = await Promise.race([work.then(() => 'done' as const), deadline]);
    if (first === 'deadline') {
      // Every later unit is refused by the budget it has long outrun, so the
      // one in flight is all that is left behind.
      console.warn(`${TAG} Still working at the deadline; reporting back and leaving it to finish`);
      work.catch((err: unknown) => console.warn(`${TAG} Work left running failed:`, err));
      return 'failed';
    }
  } finally {
    clearTimeout(deadlineTimer);
  }

  return ctx.failed ? 'failed' : 'ok';
}
