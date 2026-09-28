/**
 * `promise`, or nothing after `ms`.
 *
 * Never rejects on the timeout and never leaves a timer behind, so a settled
 * race keeps neither the process nor a test's fake clock busy.
 */
export async function raceWithTimeout(promise: Promise<void>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      promise,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One run of `start()` per `key`, shared by everyone who asks for it while it
 * is in flight.
 *
 * The launch pre-fetch and the screen mounting behind it ask for the very same
 * data within milliseconds of each other; without this the second ask is a
 * second round of identical queries whose answer is already on its way. The
 * entry is dropped as soon as the run settles, so the next ask really does go
 * and look — this shares work, it does not cache results.
 */
export function shareInFlight<T>(
  runs: Map<string, Promise<T>>,
  key: string,
  start: () => Promise<T>,
): Promise<T> {
  const running = runs.get(key);
  if (running) return running;

  const run = start();
  runs.set(key, run);
  // Swallowed here only to settle this bookkeeping; the rejection itself still
  // reaches every caller through the promise that was handed out.
  void run
    .catch(() => undefined)
    .finally(() => {
      if (runs.get(key) === run) runs.delete(key);
    });
  return run;
}
