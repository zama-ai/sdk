import type { Address, GenericStorage } from "./token.types";

const BALANCES_KEY = "zama:balances";

export interface BalanceCachePayload {
  storage: GenericStorage;
  tokenAddress: Address;
  owner: Address;
  handle: Address;
}

/**
 * Build a storage key for a cached decrypted balance.
 * The handle is embedded in the key so a new on-chain handle automatically
 * invalidates the cache entry — no TTL needed.
 */
function storageKey(tokenAddress: Address, owner: Address, handle: Address): string {
  return `zama:balance:${tokenAddress.toLowerCase()}:${owner.toLowerCase()}:${handle.toLowerCase()}`;
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
    const raw = await storage.get(storageKey(tokenAddress, owner, handle));
    return raw !== null ? BigInt(raw as string) : null;
  } catch {
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

async function trackKey(storage: GenericStorage, key: string): Promise<void> {
  const raw = await storage.get(BALANCES_KEY);
  const keys: string[] = raw ? JSON.parse(raw as string) : [];
  if (!keys.includes(key)) {
    keys.push(key);
    await storage.set(BALANCES_KEY, JSON.stringify(keys));
  }
}

/**
 * Remove all cached decrypted balances from storage.
 * Best-effort — never throws.
 */
export async function clearAllCachedBalances(storage: GenericStorage): Promise<void> {
  try {
    const raw = await storage.get(BALANCES_KEY);
    if (!raw) return;
    const keys: string[] = JSON.parse(raw as string);
    await Promise.all(keys.map((key) => storage.delete(key)));
    await storage.delete(BALANCES_KEY);
  } catch {
    // Best-effort — never block the caller.
  }
}
