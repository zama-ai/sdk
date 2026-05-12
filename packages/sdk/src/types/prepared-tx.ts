import type { Address, Hex } from "viem";
import type { Handle } from "../relayer/relayer-sdk.types";

// ─── Per-kind request payloads ──────────────────────────────────────────

/**
 * Confidential ERC-7984 transfer request. Atomic shape ≡ the existing
 * `Token.confidentialTransfer(to, amount)` arguments; the SDK builds an
 * unsigned EIP-1559 transaction off of this for deferred signing.
 */
export interface ConfidentialTransferRequest {
  readonly kind: "ConfidentialTransfer";
  /** Confidential token contract address. */
  readonly token: Address;
  /** Recipient address. */
  readonly to: Address;
  /** Plaintext amount; encrypted by the SDK during `prepare`. */
  readonly amount: bigint;
}

/** Operator-initiated confidential transfer. Caller must be an approved operator for `from`. */
export interface ConfidentialTransferFromRequest {
  readonly kind: "ConfidentialTransferFrom";
  readonly token: Address;
  readonly from: Address;
  readonly to: Address;
  readonly amount: bigint;
}

/** Approve/revoke an operator. `until` is a unix timestamp; omit for permanent. */
export interface SetOperatorRequest {
  readonly kind: "SetOperator";
  readonly token: Address;
  readonly operator: Address;
  readonly until?: number;
}

/**
 * First-phase unshield. Builds the unsigned tx for `wrapper.unwrap(from, to,
 * encryptedAmount, inputProof)`. Encryption happens during `prepare`.
 */
export interface UnwrapRequest {
  readonly kind: "Unwrap";
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
  readonly wrapper: Address;
  /** From the `UnwrapRequested` event log (`unwrapRequestId` on upgraded wrappers, the encrypted amount handle on legacy ones). */
  readonly unwrapRequestIdOrAmount: Handle;
}

/**
 * ERC-20 `approve(spender, value)` on the underlying token, used to grant
 * the wrapper spending rights before a non-1363 `wrap`.
 *
 * For USDT-style tokens that require a zero-reset, callers issue two
 * `ApproveUnderlying` requests in sequence (`amount: 0n` then `amount: N`)
 * or rely on the `Token.prepareShield` multi-step planner.
 */
export interface ApproveUnderlyingRequest {
  readonly kind: "ApproveUnderlying";
  readonly underlying: Address;
  readonly spender: Address;
  readonly amount: bigint;
}

/** Wrapper `wrap(to, amount)` call — the second leg of the non-1363 shield path. */
export interface WrapRequest {
  readonly kind: "Wrap";
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
  readonly underlying: Address;
  readonly wrapper: Address;
  readonly amount: bigint;
  readonly recipientData?: Hex;
}

/** ACL `delegateForUserDecryption(delegate, contract, expirationDate)`. */
export interface DelegateDecryptionRequest {
  readonly kind: "DelegateDecryption";
  readonly aclAddress: Address;
  readonly contractAddress: Address;
  readonly delegateAddress: Address;
  /** Optional expiration date; omit for permanent (uint64.max). */
  readonly expirationDate?: Date;
}

/** ACL `revokeDelegationForUserDecryption(delegate, contract)`. */
export interface RevokeDelegationRequest {
  readonly kind: "RevokeDelegation";
  readonly aclAddress: Address;
  readonly contractAddress: Address;
  readonly delegateAddress: Address;
}

/**
 * FHE credential permit request. Used via {@link ZamaSDK.execute} for both
 * online and broadcast signers — the underlying flow signs typed data (not
 * a transaction), so this kind never appears in {@link PreparedTransaction}.
 *
 * The cross-process "prepare typed-data, sign externally, store later" flow
 * lands in Phase 3 with dedicated `prepareCredentialPermit` /
 * `completeCredentialPermit` helpers; in Phase 2 only the atomic
 * {@link ZamaSDK.execute} path exists.
 */
export interface CredentialPermitRequest {
  readonly kind: "CredentialPermit";
  /** Contract addresses to authorize. */
  readonly contracts: readonly Address[];
  /** Delegator address for delegated decryption permits. */
  readonly delegator?: Address;
}

// ─── Discriminator unions ───────────────────────────────────────────────

/**
 * Kinds of write operations that follow the prepare → sign → broadcast
 * pipeline (yields a {@link TransactionResult}). Excludes typed-data flows
 * like {@link CredentialPermitRequest}.
 *
 * Single-tx kinds. Multi-step flows (shield over a non-1363 underlying,
 * the request → finalize unshield round-trip) are composed at the Token
 * level out of these primitives.
 */
export type TransactionKind = TransactionPrepareRequest["kind"];

/** Discriminated union of all transaction prepare requests. */
export type TransactionPrepareRequest =
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

/** Anything accepted by {@link ZamaSDK.execute}. */
export type ExecuteRequest = TransactionPrepareRequest | CredentialPermitRequest;

// ─── Prepared payloads ──────────────────────────────────────────────────

/**
 * RLP-encoded unsigned transaction plus the originating request and the
 * minimal context (from, to, chainId) callers need to forward across a
 * process boundary or feed back into {@link ZamaSDK.broadcast} /
 * {@link ZamaSDK.completeFromTxHash}.
 *
 * Non-generic so any `PreparedX` is assignable to the wide form. Use
 * {@link PreparedFor} for kind-specific narrowing (e.g. on Token-level
 * `prepareX` return types).
 *
 * JSON-serializable: ship to another process with `JSON.stringify`,
 * revive with `JSON.parse` (bigints inside the request are out of scope —
 * none of the supported kinds carry bigints at this layer; bigint fields
 * like `amount` are folded into the unsigned tx during `prepare`).
 */
export interface PreparedTransaction {
  readonly kind: TransactionKind;
  readonly request: TransactionPrepareRequest;
  readonly unsignedTx: Hex;
  readonly from: Address;
  readonly to: Address;
  readonly chainId: number;
}

/**
 * {@link PreparedTransaction} narrowed by `kind` — return type of
 * `sdk.prepare(request)` and the Token-level `prepareX` sugar methods.
 * Always a subtype of {@link PreparedTransaction}.
 */
export type PreparedFor<K extends TransactionKind> = PreparedTransaction & {
  readonly kind: K;
  readonly request: Extract<TransactionPrepareRequest, { kind: K }>;
};
