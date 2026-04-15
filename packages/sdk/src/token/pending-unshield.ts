import type { Address, Hex } from "viem";
import type { GenericStorage } from "../types";
import type { Handle } from "../relayer/relayer-sdk.types";

const STORAGE_PREFIX = "zama:pending-unshield:";
const CURRENT_VERSION = 1;

export interface PendingUnshieldRequest {
  readonly unwrapTxHash: Hex;
  readonly unwrapRequestId?: Handle;
}

interface StoredPendingUnshieldRequest extends PendingUnshieldRequest {
  readonly version: typeof CURRENT_VERSION;
}

function storageKey(wrapperAddress: Address): string {
  return `${STORAGE_PREFIX}${wrapperAddress}`;
}

function normalizePendingUnshield(
  value: Hex | StoredPendingUnshieldRequest | null,
): PendingUnshieldRequest | null {
  if (value === null) {
    return null;
  }
  if (typeof value === "string") {
    return { unwrapTxHash: value };
  }
  if (typeof value === "object" && "unwrapTxHash" in value) {
    return {
      unwrapTxHash: value.unwrapTxHash,
      unwrapRequestId: value.unwrapRequestId,
    };
  }
  return null;
}

/**
 * Persist the unwrap tx hash so an interrupted unshield can be resumed later
 * (e.g. after a page reload).
 */
export async function savePendingUnshield(
  storage: GenericStorage,
  wrapperAddress: Address,
  unwrapTxHash: Hex,
  unwrapRequestId?: Handle,
): Promise<void> {
  if (unwrapRequestId === undefined) {
    await storage.set(storageKey(wrapperAddress), unwrapTxHash);
    return;
  }

  await storage.set(storageKey(wrapperAddress), {
    version: CURRENT_VERSION,
    unwrapTxHash,
    unwrapRequestId,
  } satisfies StoredPendingUnshieldRequest);
}

/**
 * Load a previously saved unwrap tx hash, or `null` if none exists.
 */
export async function loadPendingUnshield(
  storage: GenericStorage,
  wrapperAddress: Address,
): Promise<Hex | null> {
  const request = await loadPendingUnshieldRequest(storage, wrapperAddress);
  return request?.unwrapTxHash ?? null;
}

/**
 * Load a previously saved unwrap request, including `unwrapRequestId` when available.
 */
export async function loadPendingUnshieldRequest(
  storage: GenericStorage,
  wrapperAddress: Address,
): Promise<PendingUnshieldRequest | null> {
  const value = await storage.get<Hex | StoredPendingUnshieldRequest>(storageKey(wrapperAddress));
  return normalizePendingUnshield(value);
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
