import type { Address, Hex } from "viem";
import type { EncryptedValue } from "../relayer/types";

// ─── Per-kind request payloads ──────────────────────────────────────────

/**
 * Confidential ERC-7984 transfer request. Atomic shape ≡ the existing
 * {@link Token.confidentialTransfer} `(to, amount)` arguments; the SDK builds an
 * unsigned EIP-1559 transaction off of this for offline signing.
 */
export interface ConfidentialTransferRequest {
  readonly kind: "ConfidentialTransfer";
  /** Tx-sender wallet address (the originator). */
  readonly from: Address;
  /** Confidential token contract address. */
  readonly token: Address;
  /** Recipient address. */
  readonly to: Address;
  /** Plaintext amount; encrypted by the SDK during `prepare`. */
  readonly amount: bigint;
}

/**
 * Operator-initiated confidential transfer. Caller must be an approved
 * operator for `owner`. `from` is the operator/tx-sender wallet address;
 * `owner` is the token holder whose balance is debited.
 */
export interface ConfidentialTransferFromRequest {
  readonly kind: "ConfidentialTransferFrom";
  /** Operator/tx-sender wallet address. */
  readonly from: Address;
  readonly token: Address;
  /** Token holder whose balance is being moved. */
  readonly owner: Address;
  readonly to: Address;
  readonly amount: bigint;
}

/** Approve/revoke an operator. `until` is a unix timestamp; omit for permanent. */
export interface SetOperatorRequest {
  readonly kind: "SetOperator";
  readonly from: Address;
  readonly token: Address;
  readonly operator: Address;
  readonly until?: number;
}

/**
 * First-phase unshield. Builds the unsigned tx for
 * `wrapper.unwrap(from, to, encryptedAmount, inputProof)`.
 * Encryption happens during `prepare`.
 */
export interface UnwrapRequest {
  readonly kind: "Unwrap";
  readonly from: Address;
  /** Confidential token (== wrapper for ERC-7984 wrappers). */
  readonly token: Address;
  /** Underlying-token recipient. */
  readonly to: Address;
  /** Plaintext unwrap amount; encrypted during `prepare`. */
  readonly amount: bigint;
}

/**
 * First-phase unshield-all variant: uses the on-chain confidential balance
 * handle as input, skipping the encrypted-amount path.
 */
export interface UnwrapAllRequest {
  readonly kind: "UnwrapAll";
  readonly from: Address;
  readonly token: Address;
  readonly to: Address;
}

/**
 * Second-phase unshield. Public-decrypts the request handle during `prepare`
 * to obtain the clear value + proof, then builds the unsigned
 * `wrapper.finalizeUnwrap(handle, clear, proof)` tx.
 */
export interface FinalizeUnwrapRequest {
  readonly kind: "FinalizeUnwrap";
  readonly from: Address;
  readonly wrapper: Address;
  /** From the `UnwrapRequested` event log (`unwrapRequestId` on upgraded wrappers, the encrypted amount handle on legacy ones). */
  readonly unwrapRequestIdOrAmount: EncryptedValue;
}

/**
 * ERC-20 `approve(spender, value)` on the underlying token, used to grant
 * the wrapper spending rights before a non-1363 `wrap`.
 *
 * For USDT-style tokens that revert on a non-zero → non-zero approval,
 * callers must issue two `ApproveUnderlying` requests in sequence
 * (`amount: 0n` then `amount: N`). {@link WrappedToken.prepareShield} does not detect
 * this case; check existing allowance first when integrating with USDT-like
 * underlyings.
 */
export interface ApproveUnderlyingRequest {
  readonly kind: "ApproveUnderlying";
  readonly from: Address;
  readonly underlying: Address;
  readonly spender: Address;
  readonly amount: bigint;
}

/** Wrapper `wrap(to, amount)` call — the second leg of the non-1363 shield path. */
export interface WrapRequest {
  readonly kind: "Wrap";
  readonly from: Address;
  readonly wrapper: Address;
  readonly to: Address;
  readonly amount: bigint;
}

/**
 * ERC-1363 `transferAndCall(wrapper, amount, data)` — the single-tx shield
 * path for 1363-compatible underlyings. `data` is the recipient encoded as
 * 20 raw bytes (or `0x` for self-shield).
 */
export interface TransferAndCallRequest {
  readonly kind: "TransferAndCall";
  readonly from: Address;
  readonly underlying: Address;
  readonly wrapper: Address;
  readonly amount: bigint;
  readonly recipientData?: Hex;
}

/** ACL `delegateForUserDecryption(delegate, contract, expirationDate)`. */
export interface DelegateDecryptionRequest {
  readonly kind: "DelegateDecryption";
  readonly from: Address;
  readonly aclAddress: Address;
  readonly contractAddress: Address;
  readonly delegateAddress: Address;
  /** Optional expiration date; omit for permanent (uint64.max). */
  readonly expirationDate?: Date;
}

/** ACL `revokeDelegationForUserDecryption(delegate, contract)`. */
export interface RevokeDelegationRequest {
  readonly kind: "RevokeDelegation";
  readonly from: Address;
  readonly aclAddress: Address;
  readonly contractAddress: Address;
  readonly delegateAddress: Address;
}

// ─── Discriminator unions ───────────────────────────────────────────────

/**
 * Kinds of write operations that follow the prepare → sign → broadcast
 * pipeline (yields a {@link TransactionResult}). Decryption permits are not
 * transactions and are acquired via `sdk.permits.grantPermit` instead.
 *
 * Single-tx kinds. Multi-step flows (shield over a non-1363 underlying,
 * the request → finalize unshield round-trip) are composed at the Token
 * level out of these primitives.
 */
export type TransactionKind = PrepareTransactionRequest["kind"];

/** Discriminated union of all transaction prepare requests. */
export type PrepareTransactionRequest =
  | ConfidentialTransferRequest
  | ConfidentialTransferFromRequest
  | SetOperatorRequest
  | UnwrapRequest
  | UnwrapAllRequest
  | FinalizeUnwrapRequest
  | ApproveUnderlyingRequest
  | WrapRequest
  | TransferAndCallRequest
  | DelegateDecryptionRequest
  | RevokeDelegationRequest;

// ─── Prepared payloads ──────────────────────────────────────────────────

/**
 * RLP-encoded unsigned transaction plus the originating request and the
 * minimal context (from, to, chainId) callers need to forward across a
 * process boundary or feed back into {@link Offline.broadcast} /
 * {@link Offline.resume}.
 *
 * Non-generic so any `PreparedX` is assignable to the wide form. Use
 * {@link PreparedFor} for kind-specific narrowing (e.g. on Token-level
 * `prepareX` return types).
 *
 * The `unsignedTx` + `from` / `to` / `chainId` fields are JSON-safe and
 * cover everything `broadcast` / `resume` need. The `request`
 * field is preserved for diagnostics and includes the original caller input
 * — several kinds carry `bigint` fields (`amount`, …), so callers shipping
 * a {@link PreparedTransaction} across a process boundary should strip or
 * stringify `request` before `JSON.stringify`.
 */
export interface PreparedTransaction {
  readonly kind: TransactionKind;
  readonly request: PrepareTransactionRequest;
  readonly unsignedTx: Hex;
  readonly from: Address;
  readonly to: Address;
  readonly chainId: number;
}

/**
 * {@link PreparedTransaction} narrowed by `kind` — return type of
 * `sdk.offlineSigning.prepare(request)` and the Token-level `prepareX` sugar methods.
 *
 * An interface extending {@link PreparedTransaction} that pins `kind` and
 * `request` to the requested kind `K`, so every `PreparedFor<K>` remains
 * assignable to the wide {@link PreparedTransaction}.
 */
export interface PreparedFor<K extends TransactionKind> extends PreparedTransaction {
  readonly kind: K;
  readonly request: Extract<PrepareTransactionRequest, { kind: K }>;
}
