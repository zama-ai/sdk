import type { ClearValueType } from "@zama-fhe/relayer-sdk/bundle";
import type { Handle } from "../relayer/relayer-sdk.types";
import type { ZamaSDK } from "../zama-sdk";

/**
 * Per-SDK in-memory cache for decrypted handle values.
 *
 * Keyed by the ciphertext handle, so a new on-chain handle automatically
 * misses the cache — no TTL needed (same principle as `balance-cache.ts`).
 *
 * The cache is scoped per `ZamaSDK` instance via a `WeakMap`, so it is
 * automatically garbage-collected when the SDK instance is no longer referenced.
 */
const caches = new WeakMap<ZamaSDK, Map<Handle, ClearValueType>>();

export function getDecryptCache(sdk: ZamaSDK): Map<Handle, ClearValueType> {
  let cache = caches.get(sdk);
  if (!cache) {
    cache = new Map();
    caches.set(sdk, cache);
  }
  return cache;
}

export function clearDecryptCache(sdk: ZamaSDK): void {
  caches.delete(sdk);
}
