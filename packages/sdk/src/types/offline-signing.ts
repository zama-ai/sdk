import type { Address, Hex } from "viem";

/**
 * Confidential ERC-7984 transfer request. Atomic shape ≡ the existing
 * {@link Token.confidentialTransfer} `(to, amount)` arguments; the SDK builds an
 * unsigned EIP-1559 transaction off of this for offline signing.
 */
export interface ConfidentialTransferRequest {
  /** Discriminator. */
  kind: "ConfidentialTransfer";
  /** Tx-sender wallet — signs and broadcasts the prepared tx. */
  from: Address;
  /** Confidential ERC-7984 token address. */
  token: Address;
  /** Recipient address. */
  to: Address;
  /** Cleartext amount; the SDK encrypts it during `prepare`. */
  amount: bigint;
}

/**
 * Operator-initiated confidential transfer. Caller must be an approved
 * operator for `owner`. `from` is the operator/tx-sender wallet address;
 * `owner` is the token holder whose balance is debited.
 */
export interface ConfidentialTransferFromRequest {
  /** Discriminator. */
  kind: "ConfidentialTransferFrom";
  /** Operator/tx-sender wallet — signs, broadcasts, and is the encryption binding. */
  from: Address;
  /** Confidential ERC-7984 token address. */
  token: Address;
  /** Token holder whose balance is debited. */
  owner: Address;
  /** Recipient address. */
  to: Address;
  /** Cleartext amount; the SDK encrypts it during `prepare`. */
  amount: bigint;
}

/**
 * Approve/revoke an operator. `until` is a required unix timestamp (seconds)
 * the approval expires at.
 *
 * Unlike the atomic {@link Token.setOperator} path — which defaults an omitted
 * `until` to a short relative window — the offline payload is frozen at prepare
 * time and signed later, so a relative default would silently expire mid-
 * ceremony and a far-future default would grant a de-facto permanent operator.
 * The caller must state the expiry explicitly; set a far-future timestamp for
 * an effectively permanent grant, or `0 < until < now` to revoke.
 */
export interface SetOperatorRequest {
  /** Discriminator. */
  kind: "SetOperator";
  /** Tx-sender wallet — signs and broadcasts the prepared tx. */
  from: Address;
  /** Confidential ERC-7984 token address. */
  token: Address;
  /** Operator address to approve or revoke. */
  operator: Address;
  /** Unix timestamp (seconds) the approval expires at; a positive value already in the past revokes. */
  until: number;
}

/**
 * First-phase unshield. Builds the unsigned tx for
 * `wrapper.unwrap(from, to, encryptedAmount, inputProof)`.
 * Encryption happens during `prepare`.
 */
export interface UnwrapRequest {
  /** Discriminator. */
  kind: "Unwrap";
  /** Tx-sender wallet — signs and broadcasts the prepared tx. */
  from: Address;
  /** Confidential ERC-7984 token (wrapper) address. */
  token: Address;
  /** Recipient of the unshielded (public) funds. */
  to: Address;
  /** Cleartext amount to unshield; the SDK encrypts it during `prepare`. */
  amount: bigint;
}

/**
 * First-phase unshield-all variant: uses the on-chain confidential balance's
 * encrypted value as input, skipping the encrypted-amount path.
 */
export interface UnwrapAllRequest {
  /** Discriminator. */
  kind: "UnwrapAll";
  /** Tx-sender wallet — signs and broadcasts the prepared tx. */
  from: Address;
  /** Confidential ERC-7984 token (wrapper) address. */
  token: Address;
  /** Recipient of the unshielded (public) funds. */
  to: Address;
}

/**
 * Second-phase unshield. Public-decrypts `unwrapRequestIdOrAmount` during
 * `prepare` to obtain the clear value + proof, then builds the unsigned
 * `wrapper.finalizeUnwrap(handle, clear, proof)` tx. `unwrapRequestIdOrAmount`
 * comes from the `UnwrapRequested` event log (`unwrapRequestId` on upgraded
 * wrappers, the encrypted amount on legacy ones).
 */
export interface FinalizeUnwrapRequest {
  /** Discriminator. */
  kind: "FinalizeUnwrap";
  /** Tx-sender wallet — signs and broadcasts the prepared tx. */
  from: Address;
  /** Wrapper (confidential token) contract address. */
  wrapper: Address;
  /** `unwrapRequestId` (upgraded wrappers) or the encrypted amount (legacy), from the `UnwrapRequested` log. */
  unwrapRequestIdOrAmount: Hex;
}

/**
 * ERC-20 `approve(spender, value)` on the underlying token, used to grant
 * the wrapper spending rights before a non-1363 `wrap`.
 *
 * For USDT-style tokens that revert on a non-zero → non-zero approval,
 * callers must issue two `ApproveUnderlying` requests in sequence
 * (`amount: 0n` then `amount: N`); check existing allowance first when
 * integrating with USDT-like underlyings.
 */
export interface ApproveUnderlyingRequest {
  /** Discriminator. */
  kind: "ApproveUnderlying";
  /** Tx-sender wallet — signs and broadcasts the prepared tx. */
  from: Address;
  /** Underlying ERC-20 token address. */
  underlying: Address;
  /** Address granted the allowance (typically the wrapper). */
  spender: Address;
  /** Allowance amount to set. */
  amount: bigint;
}

/** Wrapper `wrap(to, amount)` call — the second leg of the non-1363 shield path. */
export interface WrapRequest {
  /** Discriminator. */
  kind: "Wrap";
  /** Tx-sender wallet — signs and broadcasts the prepared tx. */
  from: Address;
  /** Wrapper (confidential token) contract address. */
  wrapper: Address;
  /** Recipient of the shielded (confidential) funds. */
  to: Address;
  /** Public amount to shield. */
  amount: bigint;
}

/**
 * ERC-1363 `transferAndCall(wrapper, amount, data)` — the single-tx shield
 * path for 1363-compatible underlyings. `recipientData` is the recipient
 * encoded as 20 raw bytes (or `0x` for self-shield); omit to self-shield to
 * the sender.
 */
export interface TransferAndCallRequest {
  /** Discriminator. */
  kind: "TransferAndCall";
  /** Tx-sender wallet — signs and broadcasts the prepared tx. */
  from: Address;
  /** Underlying ERC-1363 token address. */
  underlying: Address;
  /** Wrapper (confidential token) contract address. */
  wrapper: Address;
  /** Public amount to shield. */
  amount: bigint;
  /** Recipient as 20 raw bytes, or `0x`/omitted to self-shield to the sender. */
  recipientData?: Hex;
}

/**
 * ACL `delegateForUserDecryption(delegate, contract, expirationDate)`.
 *
 * `expirationDate` is the caller-facing `Date`; the SDK transforms it into the
 * on-chain `uint64` at prepare time. Omit for permanent (uint64.max). When
 * set, it must be ≥1h in the future (mirrors the atomic delegateDecryption
 * guard).
 */
export interface DelegateDecryptionRequest {
  /** Discriminator. */
  kind: "DelegateDecryption";
  /** Delegator/tx-sender wallet — signs and broadcasts the prepared tx. */
  from: Address;
  /** ACL contract address. */
  aclAddress: Address;
  /** Contract the delegation grants decrypt access to. */
  contractAddress: Address;
  /** Address being granted delegated decryption. */
  delegateAddress: Address;
  /** Expiry as a `Date`; omit for permanent. Must be ≥1h in the future when set. */
  expirationDate?: Date;
}

/** ACL `revokeDelegationForUserDecryption(delegate, contract)`. */
export interface RevokeDelegationRequest {
  /** Discriminator. */
  kind: "RevokeDelegation";
  /** Delegator/tx-sender wallet — signs and broadcasts the prepared tx. */
  from: Address;
  /** ACL contract address. */
  aclAddress: Address;
  /** Contract whose delegation is being revoked. */
  contractAddress: Address;
  /** Address whose delegated decryption is revoked. */
  delegateAddress: Address;
}

/**
 * Discriminated union (on `kind`) of every offline `prepare` request — the
 * caller-facing input type. Members that transform at parse time (e.g.
 * {@link DelegateDecryptionRequest}, whose `expirationDate` is a `Date` on the
 * way in) present their pre-parse shape.
 */
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

/**
 * Kinds of write operations that go through the offline `prepare` pipeline —
 * the caller signs and broadcasts the prepared unsigned tx out-of-process.
 * Decryption permits are not transactions and are acquired via
 * `sdk.permits.grantPermit` instead.
 *
 * Single-tx kinds. Multi-step flows (shield over a non-1363 underlying,
 * the request → finalize unshield round-trip) are composed at the Token
 * level out of these primitives.
 */
export type TransactionKind = PrepareTransactionRequest["kind"];

/**
 * EIP-1559 fees. `maxFeePerGas` and `maxPriorityFeePerGas` live in one object
 * so they can only be supplied together — pinning a cap (the total fee) while
 * the tip is estimated can produce a tip above the cap and fail serialization.
 */
export interface PrepareFees {
  /** EIP-1559 max fee per gas — the total per-gas cap. */
  maxFeePerGas: bigint;
  /** EIP-1559 max priority fee per gas — the miner tip. */
  maxPriorityFeePerGas: bigint;
}

/**
 * Per-call chain-state overrides accepted by the offline `prepare` methods.
 * Every field is optional; omitted ones fall back to the provider's live
 * chain-state defaults.
 */
export interface PrepareOptions {
  /** Account nonce; omit to use the provider's live value. */
  nonce?: number;
  /** Gas limit; omit to estimate. */
  gasLimit?: bigint;
  /** EIP-1559 fee pair; omit to estimate from live chain state. */
  fees?: PrepareFees;
}

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
