import type { Address, GenericStorage, Hex } from "./token.types";

const STORAGE_PREFIX = "zama:pending-unshield:";

/** Identity scoping so pending-unshield state never collides across accounts/chains. */
export interface PendingUnshieldScope {
  /** Connected wallet address. */
  accountAddress: Address;
  /** Chain ID of the connected network. */
  chainId: number;
  /** Wrapper contract address. */
  wrapperAddress: Address;
}

function storageKey({ chainId, accountAddress, wrapperAddress }: PendingUnshieldScope): string {
  return `${STORAGE_PREFIX}${chainId}:${accountAddress.toLowerCase()}:${wrapperAddress.toLowerCase()}`;
}

/**
 * Persist the unwrap tx hash so an interrupted unshield can be resumed later
 * (e.g. after a page reload).
 */
export async function savePendingUnshield(
  storage: GenericStorage,
  scope: PendingUnshieldScope,
  unwrapTxHash: Hex,
): Promise<void> {
  await storage.set(storageKey(scope), unwrapTxHash);
}

/**
 * Load a previously saved unwrap tx hash, or `null` if none exists.
 */
export async function loadPendingUnshield(
  storage: GenericStorage,
  scope: PendingUnshieldScope,
): Promise<Hex | null> {
  return storage.get<Hex>(storageKey(scope));
}

/**
 * Clear the saved unwrap tx hash after a successful finalization.
 */
export async function clearPendingUnshield(
  storage: GenericStorage,
  scope: PendingUnshieldScope,
): Promise<void> {
  await storage.delete(storageKey(scope));
}
