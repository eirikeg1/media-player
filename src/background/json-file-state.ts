import { File, Paths } from 'expo-file-system';

/**
 * A small JSON document next to the databases, for the state a background wake
 * has to read.
 *
 * An OS wake starts the app headless: no zustand store and no signed-in user.
 * The database is reachable, but a user's settings row is not something the
 * wake can pick — so whatever the task needs from the user's settings is
 * mirrored into a file like this one, which it can always read.
 *
 * Every read is total — a missing, unreadable or corrupt file reads as `empty`
 * rather than throwing, because a broken file must not stop the app from
 * starting or the task from falling back to its defaults.
 */
export interface JsonFileState<T> {
  read(): Promise<T>;
  /** Merge `patch` into what is stored. */
  update(patch: Partial<T>): Promise<void>;
}

export interface JsonFileStateOptions<T> {
  fileName: string;
  /** What a missing or unreadable file reads as. */
  empty: T;
  /**
   * Turn the parsed JSON object into a `T`, checking every field: the file is
   * written by older (and newer) builds as much as by this one.
   */
  parse(raw: Record<string, unknown>): T;
  /** Log prefix, e.g. `[sports-refresh]`. */
  tag: string;
}

export function createJsonFileState<T extends object>({
  fileName,
  empty,
  parse,
  tag,
}: JsonFileStateOptions<T>): JsonFileState<T> {
  const file = () => new File(Paths.document, fileName);

  /**
   * What the file holds, once it has been read. The file API is synchronous on
   * the JS thread, so one copy in memory means the file is read once per
   * process; writes still go through, since the file is the whole point.
   */
  let cached: T | null = null;

  /**
   * Serialises every access. Storing one field is a read-modify-write of a
   * shared file: two of them interleaved would each write the other's field
   * back to the value it had before, silently losing one of the two updates.
   */
  let tail: Promise<unknown> = Promise.resolve();

  function serialize<R>(task: () => Promise<R>): Promise<R> {
    const run = tail.then(task, task);
    // The chain must survive a rejection, or every later access rejects with it.
    tail = run.catch(() => undefined);
    return run;
  }

  async function readFile(): Promise<T> {
    try {
      const handle = file();
      if (!handle.exists) return empty;
      const parsed: unknown = JSON.parse(await handle.text());
      if (typeof parsed !== 'object' || parsed === null) return empty;
      return parse(parsed as Record<string, unknown>);
    } catch (err) {
      console.warn(`${tag} Could not read ${fileName}:`, err);
      return empty;
    }
  }

  return {
    read() {
      return serialize(async () => {
        cached ??= await readFile();
        return cached;
      });
    },

    /**
     * Merged onto what is on *disk*, not onto the cached copy: an OS wake runs
     * the task in its own process, which writes there. Merging onto a cache
     * read before that wake would write the task's own update back over.
     */
    update(patch) {
      return serialize(async () => {
        const next: T = { ...(await readFile()), ...patch };
        // Memory first: a failed write must not leave this process disagreeing
        // with itself about a value the user already changed.
        cached = next;
        try {
          // `write` creates the file when it is missing; the document directory
          // the databases live in is always there.
          file().write(JSON.stringify(next));
        } catch (err) {
          console.warn(`${tag} Could not write ${fileName}:`, err);
        }
      });
    },
  };
}
