import type { ClearValueType } from "@zama-fhe/relayer-sdk/bundle";
import { getAddress, type Address } from "viem";
import type { Handle } from "./relayer/relayer-sdk.types";
import type { GenericStorage } from "./types";

const DECRYPT_KEYS_KEY = "zama:decrypt:keys";
const pendingTrackedKeyWrites = new WeakMap<GenericStorage, Promise<void>>();

function userStoragePrefix(requester: Address): string {
  return `zama:decrypt:${getAddress(requester)}`;
}

function userStorageKey(requester: Address, contractAddress: Address, handle: Handle): string {
  return `${userStoragePrefix(requester)}:${getAddress(contractAddress)}:${handle.toLowerCase()}`;
}

async function getTrackedKeys(storage: GenericStorage): Promise<string[]> {
  return (await storage.get<string[]>(DECRYPT_KEYS_KEY)) ?? [];
}

async function trackKey(storage: GenericStorage, key: string): Promise<void> {
  const prev = pendingTrackedKeyWrites.get(storage) ?? Promise.resolve();
  const next = prev.then(async () => {
    const keys = await getTrackedKeys(storage);
    if (!keys.includes(key)) {
      await storage.set(DECRYPT_KEYS_KEY, [...keys, key]);
    }
  });
  pendingTrackedKeyWrites.set(
    storage,
    next.catch(() => {}),
  );
  return next;
}

export async function loadCachedUserDecryption(
  storage: GenericStorage,
  requester: Address,
  contractAddress: Address,
  handle: Handle,
): Promise<ClearValueType | null> {
  try {
    return await storage.get<ClearValueType>(userStorageKey(requester, contractAddress, handle));
  } catch (error) {
    // oxlint-disable-next-line no-console
    console.warn("[zama-sdk] User decrypt cache read failed:", error);
    return null;
  }
}

export async function saveCachedUserDecryption(
  storage: GenericStorage,
  requester: Address,
  contractAddress: Address,
  handle: Handle,
  value: ClearValueType,
): Promise<void> {
  try {
    const key = userStorageKey(requester, contractAddress, handle);
    await storage.set(key, value);
    await trackKey(storage, key);
  } catch {
    // Best-effort — never block the caller.
  }
}

async function deleteTrackedKeys(
  storage: GenericStorage,
  predicate: (key: string) => boolean,
): Promise<void> {
  const keys = await getTrackedKeys(storage);
  const keysToDelete = keys.filter(predicate);
  if (keysToDelete.length === 0) {
    return;
  }

  await Promise.all(keysToDelete.map((key) => storage.delete(key)));
  const remaining = keys.filter((key) => !predicate(key));
  if (remaining.length === 0) {
    await storage.delete(DECRYPT_KEYS_KEY);
  } else {
    await storage.set(DECRYPT_KEYS_KEY, remaining);
  }
}

/**
 * Clear cached decryptions for specific contracts, or all of them.
 *
 * When `contractAddresses` is empty, clears **all** cached decryptions for
 * the requester (equivalent to {@link clearCachedUserDecryptions}).
 */
export async function clearCachedDecryptionsForContracts(
  storage: GenericStorage,
  requester: Address,
  contractAddresses: readonly Address[],
): Promise<void> {
  if (contractAddresses.length === 0) {
    await clearCachedUserDecryptions(storage, requester);
    return;
  }

  try {
    const contractPrefixes = contractAddresses.map(
      (addr) => `${userStoragePrefix(requester)}:${getAddress(addr)}:`,
    );
    await deleteTrackedKeys(storage, (key) =>
      contractPrefixes.some((prefix) => key.startsWith(prefix)),
    );
  } catch {
    // Best-effort — never block the caller.
  }
}

export async function clearCachedUserDecryptions(
  storage: GenericStorage,
  requester: Address,
): Promise<void> {
  try {
    const prefix = `${userStoragePrefix(requester)}:`;
    await deleteTrackedKeys(storage, (key) => key.startsWith(prefix));
  } catch {
    // Best-effort — never block the caller.
  }
}

export async function clearAllCachedDecryptions(storage: GenericStorage): Promise<void> {
  try {
    await deleteTrackedKeys(storage, () => true);
  } catch {
    // Best-effort — never block the caller.
  }
}
