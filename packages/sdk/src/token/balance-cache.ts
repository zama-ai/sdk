import { getAddress, type Address } from "viem";
import type { GenericStorage } from "./token.types";
import type { Handle } from "../relayer/relayer-sdk.types";

const BALANCES_KEY = "zama:balances";

export interface BalanceCachePayload {
  storage: GenericStorage;
  tokenAddress: Address;
  owner: Address;
  handle: Handle;
}

/**
 * Build a storage key for a cached decrypted balance.
 * The handle is embedded in the key so a new on-chain handle automatically
 * invalidates the cache entry — no TTL needed.
 */
function storageKey(tokenAddress: Address, owner: Address, handle: Handle): string {
  return `zama:balance:${getAddress(tokenAddress)}:${getAddress(owner)}:${handle.toLowerCase()}`;
}

/**
 * Load a cached decrypted balance, or `null` on cache miss.
 */
export async function loadCachedBalance({
  storage,
  tokenAddress,
  owner,
  handle,
}: BalanceCachePayload): Promise<bigint | null> {
  try {
    const raw = await storage.get<string>(storageKey(tokenAddress, owner, handle));
    return raw !== null ? BigInt(raw) : null;
  } catch (error) {
    console.warn("[zama-sdk] Balance cache read failed:", error);
    return null;
  }
}

/**
 * Persist a decrypted balance to storage.
 */
export async function saveCachedBalance(
  payload: BalanceCachePayload & { value: bigint },
): Promise<void> {
  const { storage, tokenAddress, owner, handle, value } = payload;
  const key = storageKey(tokenAddress, owner, handle);
  try {
    await storage.set(key, value.toString());
    await trackKey(storage, key);
  } catch {
    // Best-effort — never block the caller.
  }
}

const trackKeyChains = new WeakMap<GenericStorage, Promise<void>>();

async function trackKey(storage: GenericStorage, key: string): Promise<void> {
  // Serialize read-modify-write per storage instance to prevent concurrent
  // saveCachedBalance calls from overwriting each other's key additions.
  const prev = trackKeyChains.get(storage) ?? Promise.resolve();
  const next = prev.then(async () => {
    const raw = await storage.get<string>(BALANCES_KEY);
    const keys: string[] = raw ? JSON.parse(raw) : [];
    if (!keys.includes(key)) {
      keys.push(key);
      await storage.set(BALANCES_KEY, JSON.stringify(keys));
    }
  });
  trackKeyChains.set(
    storage,
    next.catch(() => {}),
  ); // prevent chain poisoning
  return next;
}

/**
 * Remove all cached decrypted balances from storage.
 * Best-effort — never throws.
 */
export async function clearAllCachedBalances(storage: GenericStorage): Promise<void> {
  try {
    const raw = await storage.get<string>(BALANCES_KEY);
    if (!raw) return;
    const keys: string[] = JSON.parse(raw);
    await Promise.all(keys.map((key) => storage.delete(key)));
    await storage.delete(BALANCES_KEY);
  } catch {
    // Best-effort — never block the caller.
  }
}
