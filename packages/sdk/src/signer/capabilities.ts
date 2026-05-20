import { SignerCapabilityError } from "../errors";
import type { GenericSigner } from "../types";

const WRITE_CONTRACT_HINT =
  "Use the offline-signing path — sdk.offlineSigning.prepare({ kind, from, ... }) → signer.signTransaction(prepared.unsignedTx) → sdk.offlineSigning.broadcast(prepared, signedTx) — or configure a signer that exposes writeContract (ViemSigner, EthersSigner, WagmiSigner, or any wallet adapter that signs and broadcasts atomically).";

const SIGN_TRANSACTION_HINT =
  "Configure a signer that exposes signTransaction (subclass BaseSigner to wrap an HSM / custodian client, or use a viem/ethers wallet that supports raw-transaction signing), or run the offline-signing flow with signer: undefined and sign the prepared bytes out-of-process before passing them to sdk.offlineSigning.broadcast.";

/**
 * Type-narrowing assertion that the configured signer can sign + broadcast a
 * transaction atomically (i.e. exposes `writeContract`).
 *
 * Used at internal atomic call sites so the SDK speaks with one voice when
 * a sign-only signer is configured: callers get a typed
 * {@link SignerCapabilityError} naming the operation instead of a runtime
 * `TypeError: signer.writeContract is not a function`.
 *
 * After this call, TypeScript treats `signer.writeContract` as non-optional.
 */
export function assertWriteContract(
  signer: GenericSigner,
  operation: string,
): asserts signer is GenericSigner & Required<Pick<GenericSigner, "writeContract">> {
  if (!signer.writeContract) {
    throw new SignerCapabilityError(operation, "writeContract", WRITE_CONTRACT_HINT);
  }
}

/**
 * Type-narrowing assertion that the configured signer can produce signed
 * transaction bytes for the SDK to broadcast (i.e. exposes
 * `signTransaction`). Used by the offline-signing path when the SDK needs
 * to ask the signer to sign an SDK-built unsigned transaction.
 */
export function assertSignTransaction(
  signer: GenericSigner,
  operation: string,
): asserts signer is GenericSigner & Required<Pick<GenericSigner, "signTransaction">> {
  if (!signer.signTransaction) {
    throw new SignerCapabilityError(operation, "signTransaction", SIGN_TRANSACTION_HINT);
  }
}
