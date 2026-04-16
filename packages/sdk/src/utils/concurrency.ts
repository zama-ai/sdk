/**
 * Execute an array of async thunks with bounded concurrency.
 * Defaults to `Infinity` (equivalent to `Promise.all`).
 */
export async function pLimit<T>(
  fns: (() => Promise<T>)[],
  maxConcurrency = Infinity,
): Promise<T[]> {
  if (Number.isFinite(maxConcurrency) && maxConcurrency <= 0) {
    throw new Error("maxConcurrency must be a positive number");
  }
  if (!Number.isFinite(maxConcurrency) || maxConcurrency >= fns.length) {
    return Promise.all(fns.map((f) => f()));
  }

  const results: T[] = Array.from({ length: fns.length });
  let index = 0;

  async function worker() {
    while (index < fns.length) {
      const i = index++;
      if (fns[i]) {
        results[i] = await fns[i]();
      }
    }
  }

  await Promise.all(Array.from({ length: maxConcurrency }, worker));
  return results;
}
