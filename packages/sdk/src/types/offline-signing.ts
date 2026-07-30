import type { Address, Hex } from "viem";
import type { EncryptedValue } from "../relayer/types";

// ─── Per-kind request payloads ──────────────────────────────────────────

/**
 * Confidential ERC-7984 transfer request. Atomic shape ≡ the existing
 * {@link Token.confidentialTransfer} `(to, amount)` arguments; the SDK builds an
 * unsigned EIP-1559 transaction off of this for offline signing.
 */
export interface ConfidentialTransferRequest {
  /** Discriminator tag. */
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
  /** Discriminator tag. */
  readonly kind: "ConfidentialTransferFrom";
  /** Operator/tx-sender wallet address. */
  readonly from: Address;
  /** Confidential token contract address. */
  readonly token: Address;
  /** Token holder whose balance is being moved. */
  readonly owner: Address;
  /** Recipient address. */
  readonly to: Address;
  /** Plaintext amount; encrypted by the SDK during `prepare`. */
  readonly amount: bigint;
}

/** Approve/revoke an operator. `until` is a unix timestamp; omit for permanent. */
export interface SetOperatorRequest {
  /** Discriminator tag. */
  readonly kind: "SetOperator";
  /** Tx-sender wallet address (the token holder granting the operator). */
  readonly from: Address;
  /** Confidential token contract address. */
  readonly token: Address;
  /** Operator address to approve or revoke. */
  readonly operator: Address;
  /** Unix timestamp the approval expires at; omit for permanent. */
  readonly until?: number;
}

/**
 * First-phase unshield. Builds the unsigned tx for
 * `wrapper.unwrap(from, to, encryptedAmount, inputProof)`.
 * Encryption happens during `prepare`.
 */
export interface UnwrapRequest {
  /** Discriminator tag. */
  readonly kind: "Unwrap";
  /** Tx-sender wallet address (the originator). */
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
  /** Discriminator tag. */
  readonly kind: "UnwrapAll";
  /** Tx-sender wallet address (the originator). */
  readonly from: Address;
  /** Confidential token (== wrapper for ERC-7984 wrappers). */
  readonly token: Address;
  /** Underlying-token recipient. */
  readonly to: Address;
}

/**
 * Second-phase unshield. Public-decrypts the request handle during `prepare`
 * to obtain the clear value + proof, then builds the unsigned
 * `wrapper.finalizeUnwrap(handle, clear, proof)` tx.
 */
export interface FinalizeUnwrapRequest {
  /** Discriminator tag. */
  readonly kind: "FinalizeUnwrap";
  /** Tx-sender wallet address (the originator). */
  readonly from: Address;
  /** Wrapper (confidential token) contract address. */
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
  /** Discriminator tag. */
  readonly kind: "ApproveUnderlying";
  /** Tx-sender wallet address (the underlying-token holder). */
  readonly from: Address;
  /** Underlying ERC-20 token contract address. */
  readonly underlying: Address;
  /** Spender granted the allowance (the wrapper contract). */
  readonly spender: Address;
  /** Allowance amount to approve. */
  readonly amount: bigint;
}

/** Wrapper `wrap(to, amount)` call — the second leg of the non-1363 shield path. */
export interface WrapRequest {
  /** Discriminator tag. */
  readonly kind: "Wrap";
  /** Tx-sender wallet address (the originator). */
  readonly from: Address;
  /** Wrapper (confidential token) contract address. */
  readonly wrapper: Address;
  /** Recipient of the confidential wrapped balance. */
  readonly to: Address;
  /** Plaintext amount to wrap. */
  readonly amount: bigint;
}

/**
 * ERC-1363 `transferAndCall(wrapper, amount, data)` — the single-tx shield
 * path for 1363-compatible underlyings. `data` is the recipient encoded as
 * 20 raw bytes (or `0x` for self-shield).
 */
export interface TransferAndCallRequest {
  /** Discriminator tag. */
  readonly kind: "TransferAndCall";
  /** Tx-sender wallet address (the underlying-token holder). */
  readonly from: Address;
  /** Underlying ERC-20 (ERC-1363) token contract address. */
  readonly underlying: Address;
  /** Wrapper (confidential token) contract address, the `transferAndCall` target. */
  readonly wrapper: Address;
  /** Plaintext amount to shield. */
  readonly amount: bigint;
  /** Recipient encoded as 20 raw bytes, or `0x` for a self-shield. */
  readonly recipientData?: Hex;
}

/** ACL `delegateForUserDecryption(delegate, contract, expirationDate)`. */
export interface DelegateDecryptionRequest {
  /** Discriminator tag. */
  readonly kind: "DelegateDecryption";
  /** Tx-sender wallet address (the delegator). */
  readonly from: Address;
  /** ACL contract address. */
  readonly aclAddress: Address;
  /** Contract the delegation grants decryption rights over. */
  readonly contractAddress: Address;
  /** Address being granted decryption rights. */
  readonly delegateAddress: Address;
  /** Optional expiration date; omit for permanent (uint64.max). */
  readonly expirationDate?: Date;
}

/** ACL `revokeDelegationForUserDecryption(delegate, contract)`. */
export interface RevokeDelegationRequest {
  /** Discriminator tag. */
  readonly kind: "RevokeDelegation";
  /** Tx-sender wallet address (the delegator). */
  readonly from: Address;
  /** ACL contract address. */
  readonly aclAddress: Address;
  /** Contract the delegation being revoked covers. */
  readonly contractAddress: Address;
  /** Address whose decryption rights are being revoked. */
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
  /** The kind of the originating request. */
  readonly kind: TransactionKind;
  /** The originating request, preserved for diagnostics. */
  readonly request: PrepareTransactionRequest;
  /** RLP-encoded unsigned transaction, ready to sign. */
  readonly unsignedTx: Hex;
  /** Originating wallet address. */
  readonly from: Address;
  /** Target contract address. */
  readonly to: Address;
  /** Chain ID the transaction is bound to. */
  readonly chainId: number;
}

/**
 * {@link PreparedTransaction} narrowed by `kind` — return type of
 * `sdk.offline.prepare(request)` and the Token-level `prepareX` sugar methods.
 *
 * An interface extending {@link PreparedTransaction} that pins `kind` and
 * `request` to the requested kind `K`, so every `PreparedFor<K>` remains
 * assignable to the wide {@link PreparedTransaction}.
 */
export interface PreparedFor<K extends TransactionKind> extends PreparedTransaction {
  /** The request kind, pinned to `K`. */
  readonly kind: K;
  /** The originating request, narrowed to the `K` variant. */
  readonly request: Extract<PrepareTransactionRequest, { kind: K }>;
}
