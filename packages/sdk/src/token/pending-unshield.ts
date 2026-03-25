import type { Address, Hex } from "viem";
import type { GenericStorage } from "../types";

const STORAGE_PREFIX = "zama:pending-unshield:";

function storageKey(wrapperAddress: Address): string {
  return `${STORAGE_PREFIX}${wrapperAddress}`;
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
  await storage.set(storageKey(wrapperAddress), unwrapTxHash);
}

/**
 * Load a previously saved unwrap tx hash, or `null` if none exists.
 */
export async function loadPendingUnshield(
  storage: GenericStorage,
  wrapperAddress: Address,
): Promise<Hex | null> {
  return storage.get<Hex>(storageKey(wrapperAddress));
}

/**
 * Clear the saved unwrap tx hash after a successful finalization.
 */
export async function clearPendingUnshield(
  storage: GenericStorage,
  wrapperAddress: Address,
): Promise<void> {
  await storage.delete(storageKey(wrapperAddress));
}
