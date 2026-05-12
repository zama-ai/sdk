import type { Address, Hex } from "viem";

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
 * Phase 2 wires `ConfidentialTransfer` only; Phase 3 adds the remaining
 * ERC-7984 write ops (`Shield`, `Unwrap`, `UnwrapAll`, `FinalizeUnwrap`,
 * `ConfidentialTransferFrom`, `SetOperator`, `ApproveUnderlying`,
 * `DelegateDecryption`, `RevokeDelegation`).
 */
export type TransactionKind = ConfidentialTransferRequest["kind"];

/** Discriminated union of all transaction prepare requests. */
export type TransactionPrepareRequest = ConfidentialTransferRequest;

/** Anything accepted by {@link ZamaSDK.execute}. */
export type ExecuteRequest = TransactionPrepareRequest | CredentialPermitRequest;

// ─── Prepared payloads ──────────────────────────────────────────────────

/**
 * RLP-encoded unsigned transaction plus the originating request and the
 * minimal context (from, to, chainId) callers need to forward across a
 * process boundary or feed back into {@link ZamaSDK.broadcast} /
 * {@link ZamaSDK.completeFromTxHash}.
 *
 * JSON-serializable: ship to another process with `JSON.stringify`,
 * revive with `JSON.parse` (bigints inside the request are out of scope —
 * none of the supported kinds carry bigints at this layer; bigint fields
 * like `amount` are folded into the unsigned tx during `prepare`).
 */
export interface PreparedTransaction<K extends TransactionKind = TransactionKind> {
  readonly kind: K;
  readonly request: Extract<TransactionPrepareRequest, { kind: K }>;
  readonly unsignedTx: Hex;
  readonly from: Address;
  readonly to: Address;
  readonly chainId: number;
}

/** Alias for {@link PreparedTransaction} parametrised by kind. */
export type PreparedFor<K extends TransactionKind> = PreparedTransaction<K>;
