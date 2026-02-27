import type { Address, GenericStringStorage } from "./token.types";

const STORAGE_PREFIX = "zama:balance:";

/**
 * Build a storage key for a cached decrypted balance.
 * The handle is embedded in the key so a new on-chain handle automatically
 * invalidates the cache entry — no TTL needed.
 */
function storageKey(tokenAddress: Address, owner: Address, handle: Address): string {
  return `${STORAGE_PREFIX}${tokenAddress.toLowerCase()}:${owner.toLowerCase()}:${handle}`;
}

/**
 * Load a cached decrypted balance, or `null` on cache miss.
 */
export async function loadCachedBalance(
  storage: GenericStringStorage,
  tokenAddress: Address,
  owner: Address,
  handle: Address,
): Promise<bigint | null> {
  try {
    const raw = await storage.getItem(storageKey(tokenAddress, owner, handle));
    return raw !== null ? BigInt(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Persist a decrypted balance to storage.
 */
export async function saveCachedBalance(
  storage: GenericStringStorage,
  tokenAddress: Address,
  owner: Address,
  handle: Address,
  value: bigint,
): Promise<void> {
  try {
    await storage.setItem(storageKey(tokenAddress, owner, handle), value.toString());
  } catch {
    // Best-effort — never block the caller.
  }
}
