import type { Address, GenericStorage, Hex } from "./token.types";

const STORAGE_PREFIX = "zama:pending-unshield:";

function storageKey(wrapperAddress: Address): string {
  return `${STORAGE_PREFIX}${wrapperAddress.toLowerCase()}`;
}

/**
 * Persist the unwrap tx hash so an interrupted unshield can be resumed later
 * (e.g. after a page reload).
 */
export async function savePendingUnshield(
  storage: GenericStorage,
  wrapperAddress: Address,
  unwrapTxHash: Hex,
): Promise<void> {
  await storage.setItem(storageKey(wrapperAddress), unwrapTxHash);
}

/**
 * Load a previously saved unwrap tx hash, or `null` if none exists.
 */
export async function loadPendingUnshield(
  storage: GenericStorage,
  wrapperAddress: Address,
): Promise<Hex | null> {
  return (await storage.getItem(storageKey(wrapperAddress))) as Hex | null;
}

/**
 * Clear the saved unwrap tx hash after a successful finalization.
 */
export async function clearPendingUnshield(
  storage: GenericStorage,
  wrapperAddress: Address,
): Promise<void> {
  await storage.removeItem(storageKey(wrapperAddress));
}
