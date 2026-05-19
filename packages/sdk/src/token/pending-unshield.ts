import type { Address, Hex } from "viem";
import { z } from "zod/mini";
import { checksum, hex } from "../schemas/primitives";
import type { GenericStorage } from "../types";
import type { EncryptedValue } from "../relayer/relayer-sdk.types";

const STORAGE_PREFIX = "zama:pending-unshield:";
const CURRENT_VERSION = 1;

/**
 * Persisted state for an in-progress unshield request.
 * Used to resume an interrupted unshield after page reload.
 */
export interface PendingUnshieldRequest {
  /** Transaction hash of the original unwrap call. */
  readonly unwrapTxHash: Hex;
  /**
   * Request identifier emitted by upgraded wrapper contracts.
   * Present only for requests initiated after the protocol upgrade.
   * When defined, pass this as `unwrapRequestId` to `finalizeUnwrap`.
   * When absent (legacy request), pass the `encryptedAmount` from the `UnwrapRequested` event.
   */
  readonly unwrapRequestId?: EncryptedValue;
}

interface StoredPendingUnshieldRequest extends PendingUnshieldRequest {
  readonly version: typeof CURRENT_VERSION;
}

function storageKey(wrapperAddress: Address): string {
  return `${STORAGE_PREFIX}${checksum(wrapperAddress)}`;
}

const PendingUnshieldRequestSchema = z.union([
  z.pipe(
    hex,
    z.transform((unwrapTxHash: Hex) => ({ unwrapTxHash })),
  ),
  z.pipe(
    z.object({
      version: z.literal(CURRENT_VERSION),
      unwrapTxHash: hex,
      unwrapRequestId: z.optional(hex),
    }),
    z.transform(
      ({
        unwrapTxHash,
        unwrapRequestId,
      }: {
        version: typeof CURRENT_VERSION;
        unwrapTxHash: Hex;
        unwrapRequestId?: Hex;
      }) => ({ unwrapTxHash, unwrapRequestId }),
    ),
  ),
]);

/**
 * Persist the unwrap tx hash so an interrupted unshield can be resumed later
 * (e.g. after a page reload).
 */
export async function savePendingUnshield(
  storage: GenericStorage,
  wrapperAddress: Address,
  unwrapTxHash: Hex,
  unwrapRequestId?: EncryptedValue,
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
 *
 * `resumeUnshield()` only needs `unwrapTxHash`: it reloads the transaction receipt and
 * rediscovers the right finalize handle from the emitted `UnwrapRequested` event.
 * Use `unwrapRequestId` directly only for custom flows that call `finalizeUnwrap()`
 * without reloading the original unwrap receipt.
 */
export async function loadPendingUnshieldRequest(
  storage: GenericStorage,
  wrapperAddress: Address,
): Promise<PendingUnshieldRequest | null> {
  const key = storageKey(wrapperAddress);
  const value = await storage.get<Hex | StoredPendingUnshieldRequest>(key);
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = PendingUnshieldRequestSchema.safeParse(value);
  if (!parsed.success) {
    await storage.delete(key);
    return null;
  }
  return parsed.data as PendingUnshieldRequest;
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
