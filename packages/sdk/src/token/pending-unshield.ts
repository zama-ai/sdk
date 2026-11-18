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
   * Request identifier from the `UnwrapRequested` event. Absent until the
   * unwrap receipt is known; then it is decoded from the receipt instead.
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
 * Load every saved pending unshield for this wrapper, oldest first. An
 * unreadable stored value is deleted.
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

// Read-modify-write on one storage runs one at a time, so two unshields in
// the same tab cannot drop each other's entry. Tabs still race: GenericStorage
// has no atomic update.
const writeQueues = new WeakMap<GenericStorage, Promise<void>>();

function serialized(storage: GenericStorage, update: () => Promise<void>): Promise<void> {
  const run = (writeQueues.get(storage) ?? Promise.resolve()).then(update);
  writeQueues.set(
    storage,
    run.catch(() => {}),
  );
  return run;
}

/**
 * Persist an unwrap so an interrupted unshield can be resumed later (e.g.
 * after a page reload). Adds an entry, or fills in `unwrapRequestId` on the
 * entry for the same transaction. Other entries are kept.
 *
 * @internal
 */
export function savePendingUnshield(
  storage: GenericStorage,
  wrapperAddress: Address,
  unwrapTxHash: Hex,
  unwrapRequestId?: EncryptedValue,
): Promise<void> {
  return serialized(storage, async () => {
    const requests = await loadPendingUnshieldRequests(storage, wrapperAddress);
    const existing = requests.find((r) => sameTx(r.unwrapTxHash, unwrapTxHash));
    if (existing && (unwrapRequestId === undefined || existing.unwrapRequestId !== undefined)) {
      return;
    }
    const entry: PendingUnshieldRequest =
      unwrapRequestId === undefined ? { unwrapTxHash } : { unwrapTxHash, unwrapRequestId };
    await writeRequests(
      storage,
      wrapperAddress,
      existing ? requests.map((r) => (r === existing ? entry : r)) : [...requests, entry],
    );
  });
}

/**
 * Remove the entry for one unwrap transaction, once it is finalized or its
 * unwrap reverted. Entries for other unwraps are kept.
 *
 * @internal
 */
export function clearPendingUnshield(
  storage: GenericStorage,
  wrapperAddress: Address,
  unwrapTxHash: Hex,
): Promise<void> {
  return serialized(storage, async () => {
    const requests = await loadPendingUnshieldRequests(storage, wrapperAddress);
    const rest = requests.filter((r) => !sameTx(r.unwrapTxHash, unwrapTxHash));
    if (rest.length !== requests.length) {
      await writeRequests(storage, wrapperAddress, rest);
    }
  });
}
