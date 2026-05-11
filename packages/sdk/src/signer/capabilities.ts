import { SignerCapabilityError } from "../errors";
import type { GenericSigner } from "../types";

/**
 * Type-narrowing assertion that the configured signer can sign + broadcast a
 * transaction atomically (i.e. exposes `writeContract`).
 *
 * Used at internal atomic call sites so the SDK speaks with one voice when
 * a broadcast-only signer is configured: callers get a typed
 * {@link SignerCapabilityError} naming the operation instead of a runtime
 * `TypeError: signer.writeContract is not a function`.
 *
 * After this call, TypeScript treats `signer.writeContract` as non-optional.
 *
 * Phase 4 of SDK-75 will replace these throws with a transparent fallback
 * through `prepare + signTransaction + sendRawTransaction`; until then,
 * atomic flows continue to require an atomic signer.
 */
export function assertWriteContract(
  signer: GenericSigner,
  operation: string,
): asserts signer is GenericSigner & Required<Pick<GenericSigner, "writeContract">> {
  if (!signer.writeContract) {
    throw new SignerCapabilityError(operation, "writeContract");
  }
}

/**
 * Type-narrowing assertion that the configured signer can produce signed
 * transaction bytes for the SDK to broadcast (i.e. exposes
 * `signTransaction`). Used by the deferred-signing path when the SDK needs
 * to ask the signer to sign an SDK-built unsigned transaction.
 */
export function assertSignTransaction(
  signer: GenericSigner,
  operation: string,
): asserts signer is GenericSigner & Required<Pick<GenericSigner, "signTransaction">> {
  if (!signer.signTransaction) {
    throw new SignerCapabilityError(operation, "signTransaction");
  }
}
