import type { Address, Hex } from "viem";
import { z } from "zod/mini";
import { checksum, hex } from "../schemas/primitives";
import type { GenericStorage } from "../types";
import type { EncryptedValue } from "../relayer/types";

const STORAGE_PREFIX = "zama:pending-unshield:";
const CURRENT_VERSION = 2;

/**
 * Persisted state for an in-progress unshield request.
 * Used to resume an interrupted unshield after page reload.
 *
 * @internal
 */
export interface PendingUnshieldRequest {
  /** Transaction hash of the original unwrap call. */
  readonly unwrapTxHash: Hex;
  /**
   * Request identifier from the `UnwrapRequested` event. Only entries written
   * by older SDK versions carry it; otherwise it is decoded from the unwrap
   * receipt.
   */
  readonly unwrapRequestId?: EncryptedValue;
}

interface StoredPendingUnshieldRequests {
  readonly version: typeof CURRENT_VERSION;
  readonly requests: readonly PendingUnshieldRequest[];
}

function storageKey(wrapperAddress: Address): string {
  return `${STORAGE_PREFIX}${checksum(wrapperAddress)}`;
}

const RequestSchema = z.object({ unwrapTxHash: hex, unwrapRequestId: z.optional(hex) });

// One wrapper keeps a list, so a second unshield never overwrites the first.
// Version 1 (one object) and a bare hash are formats written by older SDK versions.
const StoredSchema = z.union([
  z.pipe(
    hex,
    z.transform((unwrapTxHash: Hex): PendingUnshieldRequest[] => [{ unwrapTxHash }]),
  ),
  z.pipe(
    z.object({ version: z.literal(1), unwrapTxHash: hex, unwrapRequestId: z.optional(hex) }),
    z.transform(({ unwrapTxHash, unwrapRequestId }): PendingUnshieldRequest[] => [
      unwrapRequestId === undefined ? { unwrapTxHash } : { unwrapTxHash, unwrapRequestId },
    ]),
  ),
  z.pipe(
    z.object({ version: z.literal(CURRENT_VERSION), requests: z.array(RequestSchema) }),
    z.transform(({ requests }) => requests as PendingUnshieldRequest[]),
  ),
]);

const sameTx = (a: Hex, b: Hex) => a.toLowerCase() === b.toLowerCase();

/**
 * Load every saved pending unshield for this wrapper, oldest first.
 *
 * @internal
 */
export async function loadPendingUnshieldRequests(
  storage: GenericStorage,
  wrapperAddress: Address,
): Promise<PendingUnshieldRequest[]> {
  const key = storageKey(wrapperAddress);
  const value = await storage.get(key);
  if (value === null || value === undefined) {
    return [];
  }
  const parsed = StoredSchema.safeParse(value);
  if (!parsed.success) {
    await storage.delete(key);
    return [];
  }
  return parsed.data;
}

async function writeRequests(
  storage: GenericStorage,
  wrapperAddress: Address,
  requests: readonly PendingUnshieldRequest[],
): Promise<void> {
  if (requests.length === 0) {
    await storage.delete(storageKey(wrapperAddress));
    return;
  }
  await storage.set(storageKey(wrapperAddress), {
    version: CURRENT_VERSION,
    requests,
  } satisfies StoredPendingUnshieldRequests);
}

/**
 * Persist an unwrap so an interrupted unshield can be resumed later (e.g.
 * after a page reload). Adds an entry unless one exists for this transaction.
 * Other entries are kept.
 *
 * @internal
 */
export async function savePendingUnshield(
  storage: GenericStorage,
  wrapperAddress: Address,
  unwrapTxHash: Hex,
): Promise<void> {
  const requests = await loadPendingUnshieldRequests(storage, wrapperAddress);
  if (!requests.some((r) => sameTx(r.unwrapTxHash, unwrapTxHash))) {
    await writeRequests(storage, wrapperAddress, [...requests, { unwrapTxHash }]);
  }
}

/**
 * Remove the entry for one unwrap transaction, after it was finalized.
 * Entries for other unwraps are kept.
 *
 * @internal
 */
export async function clearPendingUnshield(
  storage: GenericStorage,
  wrapperAddress: Address,
  unwrapTxHash: Hex,
): Promise<void> {
  const requests = await loadPendingUnshieldRequests(storage, wrapperAddress);
  const rest = requests.filter((r) => !sameTx(r.unwrapTxHash, unwrapTxHash));
  if (rest.length !== requests.length) {
    await writeRequests(storage, wrapperAddress, rest);
  }
}
