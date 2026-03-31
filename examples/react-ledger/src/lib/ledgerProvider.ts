/**
 * Minimal EIP-1193 provider interface.
 * Used throughout the app instead of importing from @ledgerhq/* to keep the
 * type boundary clean (the real provider arrives dynamically via EIP-6963).
 */
export type EIP1193Provider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on(event: string, handler: (...args: unknown[]) => void): void;
  removeListener(event: string, handler: (...args: unknown[]) => void): void;
};

// ── Module-level singleton ────────────────────────────────────────────────────
// The Ledger Button provider arrives asynchronously via EIP-6963. Both
// providers.tsx (ZamaProvider setup) and page.tsx (UI / connect flow) need it.
// Rather than threading it through React props or context, we use a module-level
// singleton: providers.tsx writes it once (notifyProviderDiscovered), page.tsx
// reads it via onProviderDiscovered or getDiscoveredProvider.

let _provider: EIP1193Provider | null = null;
const _pendingCallbacks: Array<(p: EIP1193Provider) => void> = [];

/**
 * Called once by providers.tsx when the EIP-6963 announcement fires.
 * Synchronously notifies all pending subscribers and clears the queue.
 */
export function notifyProviderDiscovered(p: EIP1193Provider): void {
  _provider = p;
  const cbs = _pendingCallbacks.splice(0);
  for (const cb of cbs) cb(p);
}

/**
 * Registers a one-time callback that fires when the provider is discovered.
 * If the provider is already known, the callback fires synchronously.
 * Returns an unsubscribe function.
 */
export function onProviderDiscovered(fn: (p: EIP1193Provider) => void): () => void {
  if (_provider !== null) {
    fn(_provider);
    return () => {};
  }
  _pendingCallbacks.push(fn);
  return () => {
    const idx = _pendingCallbacks.indexOf(fn);
    if (idx !== -1) _pendingCallbacks.splice(idx, 1);
  };
}

/**
 * Synchronous read — returns null until the provider has been discovered.
 * Use onProviderDiscovered for reactive code paths.
 */
export function getDiscoveredProvider(): EIP1193Provider | null {
  return _provider;
}
