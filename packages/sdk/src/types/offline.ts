import type { Address, Hex } from "viem";
import type { EIP712TypedData, EncryptedValue } from "../relayer/relayer-sdk.types";

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
 * (`amount: 0n` then `amount: N`). {@link Token.prepareShield} does not detect
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

/**
 * FHE decryption permit request. Unlike the transaction-kind requests, this
 * produces an EIP-712 typed-data envelope (no on-chain transaction). Pair
 * `prepare` with an external `signTypedData`, then call
 * {@link ZamaSDK.registerPermit} to register the signature.
 *
 * @see {@link ExecuteRequest} — the union accepted by `sdk.offlineSigning.execute(...)`.
 */
export interface DecryptionPermitRequest {
  readonly kind: "DecryptionPermit";
  /** Tx-sender / permit-signer wallet address. */
  readonly from: Address;
  /** Contract addresses to authorize. */
  readonly contracts: readonly Address[];
  /** Delegator address for delegated decryption permits. */
  readonly delegator?: Address;
}

// ─── Discriminator unions ───────────────────────────────────────────────

/**
 * Kinds of write operations that follow the prepare → sign → broadcast
 * pipeline (yields a {@link TransactionResult}). Excludes typed-data flows
 * like {@link DecryptionPermitRequest}.
 *
 * Single-tx kinds. Multi-step flows (shield over a non-1363 underlying,
 * the request → finalize unshield round-trip) are composed at the Token
 * level out of these primitives.
 */
export type TransactionKind = PrepareTransactionRequest["kind"];

/** Alias for {@link TransactionKind} — used in method generic constraints. */
export type TxKind = TransactionKind;

/**
 * Kinds of typed-data ("permit") flows that follow the prepare → sign →
 * registerPermit pipeline. Produces a {@link DecryptionPermitResult} rather
 * than a {@link TransactionResult}.
 */
export type PermitKind = "DecryptionPermit";

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

/** Anything accepted by {@link ZamaSDK.execute}. */
export type ExecuteRequest = PrepareTransactionRequest | DecryptionPermitRequest;

// ─── Prepared payloads ──────────────────────────────────────────────────

/**
 * RLP-encoded unsigned transaction plus the originating request and the
 * minimal context (from, to, chainId) callers need to forward across a
 * process boundary or feed back into {@link ZamaSDK.broadcast} /
 * {@link ZamaSDK.resume}.
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
 * Always a subtype of {@link PreparedTransaction}.
 *
 * Modeled as an intersection (not a standalone interface) so kind-narrowed
 * values stay assignable to the wide `PreparedTransaction` despite
 * `Extract<…, { kind: K }>` being invariant in `K` — a separate
 * `interface PreparedFor<K>` would reject `PreparedFor<"X">` where the
 * wide form is expected.
 */
export type PreparedFor<K extends TransactionKind> = PreparedTransaction & {
  readonly kind: K;
  readonly request: Extract<PrepareTransactionRequest, { kind: K }>;
};

// ─── Prepared permit (typed-data) payloads ─────────────────────────────

/**
 * The opaque per-prepare context the credential service stashes on a
 * {@link PreparedDecryptionPermit}. Callers should never construct or
 * mutate this; pass it back into {@link ZamaSDK.registerPermit} alongside
 * the external signature.
 *
 * @internal
 */
export interface DecryptionPermitContext {
  readonly keypairPublicKey: Hex;
  readonly signerAddress: Address;
  readonly delegatorAddress: Address;
  readonly chainId: number;
  readonly chunk: readonly Address[];
  readonly startTimestamp: number;
}

/**
 * Result of {@link ZamaSDK.prepare} for the `DecryptionPermit` kind. Unlike
 * {@link PreparedTransaction} this is a typed-data envelope (no
 * `unsignedTx`/`to`) — feed `typedData` to an external `signTypedData`,
 * then call {@link ZamaSDK.registerPermit} with the signature.
 *
 * `typedData` is `null` when the requested contracts are already covered
 * by an existing permit (no signature needed). Callers can short-circuit
 * by checking `prepared.typedData === null`.
 */
export interface PreparedDecryptionPermit {
  readonly kind: "DecryptionPermit";
  readonly request: DecryptionPermitRequest;
  readonly from: Address;
  readonly chainId: number;
  readonly typedData: EIP712TypedData | null;
  /** @internal — pass to {@link ZamaSDK.registerPermit}; do not mutate. */
  readonly context: DecryptionPermitContext;
}

/**
 * {@link PreparedDecryptionPermit} narrowed by `kind` (currently a single
 * kind). Mirrors {@link PreparedFor} for transaction kinds.
 */
export type PreparedPermitFor<K extends PermitKind> = PreparedDecryptionPermit & {
  readonly kind: K;
};

/** Outcome of {@link ZamaSDK.registerPermit}. */
export interface DecryptionPermitResult {
  /** The newly persisted permit chunk's contract addresses. */
  readonly contracts: readonly Address[];
  /** Permit duration in days (mirrors `permitTTL`). */
  readonly durationDays: number;
  /** Permit start timestamp (seconds since epoch). */
  readonly startTimestamp: number;
}
