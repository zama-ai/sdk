import type { Address, Hex } from "viem";
import type { TransactionKind } from "../schemas/offline";

export type {
  ApproveUnderlyingRequest,
  ConfidentialTransferFromRequest,
  ConfidentialTransferRequest,
  DelegateDecryptionRequest,
  FinalizeUnwrapRequest,
  PrepareTransactionRequest,
  RevokeDelegationRequest,
  SetOperatorRequest,
  TransactionKind,
  TransferAndCallRequest,
  UnwrapAllRequest,
  UnwrapRequest,
  WrapRequest,
} from "../schemas/offline";

/**
 * Self-contained offline-signing handoff: the RLP-encoded unsigned
 * transaction plus the two fields a custodian cannot recover from it.
 *
 * Non-generic so any `PreparedFor<K>` is assignable to the wide form. Use
 * {@link PreparedFor} for kind-specific narrowing.
 *
 * Everything else a custodian needs — `chainId`, `nonce`, `to`, `value`,
 * calldata, and the gas/fee bounds — is encoded in `unsignedTx` (an EIP-1559
 * unsigned payload) and recovered by RLP-decoding it. The two fields carried
 * alongside are the ones the bytes don't yield:
 *
 * - `from` is not present in an *unsigned* EIP-1559 tx (it is only derivable
 *   from the signature of a *signed* one), yet a custodian needs it to pick
 *   the signing key/wallet.
 * - `kind` classifies the resulting receipt's event on the broadcast side.
 *
 * All three fields are JSON-safe, so a {@link PreparedTransaction} can be
 * `JSON.stringify`'d and shipped across a process boundary as-is.
 */
export interface PreparedTransaction {
  /** The kind of the originating request. */
  readonly kind: TransactionKind;
  /** Tx-sender wallet address — the key/wallet the custodian signs with. */
  readonly from: Address;
  /** RLP-encoded unsigned transaction, ready to sign. */
  readonly unsignedTx: Hex;
}

/**
 * {@link PreparedTransaction} narrowed by `kind` — the return type of
 * `sdk.offline.prepare(request)`.
 *
 * An interface extending {@link PreparedTransaction} that pins `kind` to the
 * requested kind `K`, so every `PreparedFor<K>` remains assignable to the
 * wide {@link PreparedTransaction}.
 */
export interface PreparedFor<K extends TransactionKind> extends PreparedTransaction {
  /** The request kind, pinned to `K`. */
  readonly kind: K;
}
