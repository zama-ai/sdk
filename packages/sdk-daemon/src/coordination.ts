export type Coordinate = <T>(
  keys: readonly string[],
  signal: AbortSignal,
  operation: () => Promise<T>,
) => Promise<T>;

export function createCoordinator(): Coordinate {
  const tails = new Map<string, Promise<void>>();
  return async function coordinate<T>(
    keys: readonly string[],
    signal: AbortSignal,
    operation: () => Promise<T>,
  ): Promise<T> {
    const releases: (() => void)[] = [];
    try {
      for (const key of [...new Set(keys)].sort()) {
        signal.throwIfAborted();
        const previous = tails.get(key) ?? Promise.resolve();
        const gate = Promise.withResolvers<void>();
        const tail = previous.then(() => gate.promise);
        tails.set(key, tail);
        releases.push(() => {
          gate.resolve();
          void tail.then(() => {
            if (tails.get(key) === tail) {
              tails.delete(key);
            }
          });
        });
        const cancelled = Promise.withResolvers<never>();
        const abort = () => cancelled.reject(signal.reason);
        signal.addEventListener("abort", abort, { once: true });
        try {
          signal.throwIfAborted();
          await Promise.race([previous, cancelled.promise]);
        } finally {
          signal.removeEventListener("abort", abort);
        }
      }
      signal.throwIfAborted();
      // Keep the mutation lock until SDK work settles, even if the RPC has ended.
      return await operation();
    } finally {
      for (const release of releases.toReversed()) {
        release();
      }
    }
  };
}

export function credentialLockKeys(
  identities: readonly string[],
  signer?: string,
  scope?: string,
): string[] {
  const keys = [
    ...(signer === undefined ? [] : [`signer:${signer.toLowerCase()}`]),
    ...(scope === undefined ? [] : [`scope:${scope}`]),
  ];
  return identities.flatMap((identity) => keys.map((key) => JSON.stringify([identity, key])));
}
