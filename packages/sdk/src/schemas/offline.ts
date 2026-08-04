import { size } from "viem";
import { z } from "zod/mini";
import { MAX_UINT64 } from "../contracts/constants";
import { checksummedAddress, evmAddress, hex, unixSeconds } from "./primitives";

/** One hour in seconds — the minimum lead time a frozen `SetOperator` grant must clear. */
const ONE_HOUR_SECONDS = 3600;

/** One hour in milliseconds — the same floor for `Date`-typed expiries. */
const ONE_HOUR_MS = ONE_HOUR_SECONDS * 1000;

//MARK: Schemas

/** {@link ConfidentialTransferRequest} schema. */
export const confidentialTransferRequest = z.object({
  kind: z.literal("ConfidentialTransfer"),
  from: evmAddress,
  token: evmAddress,
  to: evmAddress,
  amount: z.bigint(),
});

/** {@link ConfidentialTransferFromRequest} schema. */
export const confidentialTransferFromRequest = z.object({
  kind: z.literal("ConfidentialTransferFrom"),
  from: evmAddress,
  token: evmAddress,
  owner: evmAddress,
  to: evmAddress,
  amount: z.bigint(),
});

/**
 * `SetOperator` expiry: a unix timestamp (seconds) at least one hour in the
 * future. The offline payload is frozen at prepare time and signed/broadcast
 * later, so an expiry under 1h out risks landing already-expired mid-ceremony;
 * set a far-future timestamp for an effectively permanent grant.
 */
const setOperatorUntil = unixSeconds.check(
  z.refine(
    (until) => until >= Math.floor(Date.now() / 1000) + ONE_HOUR_SECONDS,
    "SetOperator.until must be at least 1 hour in the future (unix seconds)",
  ),
);

/** {@link SetOperatorRequest} schema. `until` is a required unix timestamp ≥ 1h out. */
export const setOperatorRequest = z.object({
  kind: z.literal("SetOperator"),
  from: evmAddress,
  token: evmAddress,
  operator: evmAddress,
  until: setOperatorUntil,
});

/** {@link UnwrapRequest} schema. */
export const unwrapRequest = z.object({
  kind: z.literal("Unwrap"),
  from: evmAddress,
  token: evmAddress,
  to: evmAddress,
  amount: z.bigint(),
});

/** {@link UnwrapAllRequest} schema. */
export const unwrapAllRequest = z.object({
  kind: z.literal("UnwrapAll"),
  from: evmAddress,
  token: evmAddress,
  to: evmAddress,
});

/** {@link FinalizeUnwrapRequest} schema. */
export const finalizeUnwrapRequest = z.object({
  kind: z.literal("FinalizeUnwrap"),
  from: evmAddress,
  wrapper: evmAddress,
  unwrapRequestIdOrAmount: hex,
});

/** {@link ApproveUnderlyingRequest} schema. */
export const approveUnderlyingRequest = z.object({
  kind: z.literal("ApproveUnderlying"),
  from: evmAddress,
  underlying: evmAddress,
  spender: evmAddress,
  amount: z.bigint(),
});

/** {@link WrapRequest} schema. */
export const wrapRequest = z.object({
  kind: z.literal("Wrap"),
  from: evmAddress,
  wrapper: evmAddress,
  to: evmAddress,
  amount: z.bigint(),
});

/**
 * `TransferAndCall` recipient payload: `0x` (self-shield to the sender) or a
 * raw 20-byte address. The wrapper's receiver hook does
 * `to = data.length < 20 ? from : address(bytes20(data))`, so any other
 * non-empty value (e.g. a 32-byte ABI-encoded address) is truncated to its
 * first 20 bytes — minting the shielded funds to a garbage address. Reject
 * those rather than let the funds go astray; omit for a self-shield.
 */
const recipientData = hex.check(
  z.refine(
    (data) => data === "0x" || size(data) === 20,
    'TransferAndCall.recipientData must be "0x" (self-shield to the sender) or a raw 20-byte address, ' +
      "not a 32-byte ABI-encoded value the wrapper would truncate to a garbage address",
  ),
);

/** {@link TransferAndCallRequest} schema. `recipientData` is 20 raw bytes or `0x`. */
export const transferAndCallRequest = z.object({
  kind: z.literal("TransferAndCall"),
  from: evmAddress,
  underlying: evmAddress,
  wrapper: evmAddress,
  amount: z.bigint(),
  recipientData: z.optional(recipientData),
});

/**
 * {@link DelegateDecryptionRequest} schema. Input takes an optional
 * `expirationDate` (a `Date`); the parsed output is the on-chain `uint64`
 * expiry — seconds since epoch, or `MAX_UINT64` ("permanent") when omitted —
 * so callers never hand-roll the encoding.
 *
 * When set, the expiry must be ≥1h out (mirrors the atomic delegateDecryption
 * guard): an expiry under 1h lands already-expired (or nearly so), and the
 * offline payload is signed/broadcast later, eating into that margin further.
 */
export const delegateDecryptionRequest = z.pipe(
  z.object({
    kind: z.literal("DelegateDecryption"),
    from: evmAddress,
    aclAddress: evmAddress,
    contractAddress: evmAddress,
    delegateAddress: evmAddress,
    expirationDate: z.optional(
      z
        .date()
        .check(
          z.refine(
            (d) => d.getTime() >= Date.now() + ONE_HOUR_MS,
            "Expiration date must be at least 1 hour in the future",
          ),
        ),
    ),
  }),
  z.transform((request) => ({
    kind: request.kind,
    from: request.from,
    aclAddress: request.aclAddress,
    contractAddress: request.contractAddress,
    delegateAddress: request.delegateAddress,
    expirationDate: request.expirationDate
      ? BigInt(Math.floor(request.expirationDate.getTime() / 1000))
      : MAX_UINT64,
  })),
);

/** {@link RevokeDelegationRequest} schema. */
export const revokeDelegationRequest = z.object({
  kind: z.literal("RevokeDelegation"),
  from: evmAddress,
  aclAddress: evmAddress,
  contractAddress: evmAddress,
  delegateAddress: evmAddress,
});

/**
 * Discriminated union (on `kind`) of every offline `prepare` request. Backs
 * both the {@link PrepareTransactionRequest} type and the runtime validation
 * in `OfflineService.prepare`.
 */
export const prepareTransactionRequest = z.discriminatedUnion("kind", [
  confidentialTransferRequest,
  confidentialTransferFromRequest,
  setOperatorRequest,
  unwrapRequest,
  unwrapAllRequest,
  finalizeUnwrapRequest,
  approveUnderlyingRequest,
  wrapRequest,
  transferAndCallRequest,
  delegateDecryptionRequest,
  revokeDelegationRequest,
]);

/**
 * EIP-1559 fees. `maxFeePerGas` and `maxPriorityFeePerGas` live in one
 * object so they can only be supplied together — pinning a cap (the total fee)
 * while the tip is estimated can produce a tip above the cap and fail
 * serialization. Both legs are validated as `bigint` so a JS caller (no
 * compiler) can't slip a `number` into the frozen, signed payload.
 */
export const fees = z.object({ maxFeePerGas: z.bigint(), maxPriorityFeePerGas: z.bigint() });

/**
 * Per-call override schema for {@link OfflineService} methods. All fields are
 * optional; omitted ones fall back to the provider's live chain-state defaults.
 */
export const prepareOptions = z.object({
  nonce: z.optional(z.int().check(z.nonnegative())),
  gasLimit: z.optional(z.bigint()),
  fees: z.optional(fees),
});

/**
 * {@link WriteContractConfig} schema. `abi` and `args` are validated only as
 * arrays — their element shapes are the ABI-typed `TAbi`/`TFunctionName`
 * generics the runtime can't check — so this guards the structural envelope
 * (address, function name, the two arrays, optional `value`/`gas`) a provider's
 * tx-builder consumes.
 */
export const writeContractConfig = z.object({
  address: evmAddress,
  abi: z.array(z.unknown()),
  functionName: z.string(),
  args: z.array(z.unknown()),
  value: z.optional(z.bigint()),
  gas: z.optional(z.bigint()),
});

/**
 * Schema for the argument object of {@link GenericProvider.prepareTransaction}:
 * the originating `from` wallet, the write-contract `calldata`, and the
 * optional chain-state overrides. Extends {@link prepareOptions} so the
 * `nonce`/`gasLimit`/`fees` legs stay in lockstep with the per-call overrides.
 *
 * `from` is EIP-55 checksummed on parse (the custodian keys off it), so the
 * validated output can flow straight into the prepared handoff.
 */
export const prepareTransactionParams = z.extend(prepareOptions, {
  from: checksummedAddress,
  calldata: writeContractConfig,
});

//MARK: Inferred types

/**
 * Confidential ERC-7984 transfer request. Atomic shape ≡ the existing
 * {@link Token.confidentialTransfer} `(to, amount)` arguments; the SDK builds an
 * unsigned EIP-1559 transaction off of this for offline signing.
 */
export type ConfidentialTransferRequest = z.infer<typeof confidentialTransferRequest>;

/**
 * Operator-initiated confidential transfer. Caller must be an approved
 * operator for `owner`. `from` is the operator/tx-sender wallet address;
 * `owner` is the token holder whose balance is debited.
 */
export type ConfidentialTransferFromRequest = z.infer<typeof confidentialTransferFromRequest>;

/**
 * Approve/revoke an operator. `until` is a required unix timestamp (seconds)
 * the approval expires at.
 *
 * Unlike the atomic {@link Token.setOperator} path — which defaults an omitted
 * `until` to a short relative window — the offline payload is frozen at prepare
 * time and signed later, so a relative default would silently expire mid-
 * ceremony and a far-future default would grant a de-facto permanent operator.
 * The caller must state the expiry explicitly; set a far-future timestamp for
 * an effectively permanent grant.
 */
export type SetOperatorRequest = z.infer<typeof setOperatorRequest>;

/**
 * First-phase unshield. Builds the unsigned tx for
 * `wrapper.unwrap(from, to, encryptedAmount, inputProof)`.
 * Encryption happens during `prepare`.
 */
export type UnwrapRequest = z.infer<typeof unwrapRequest>;

/**
 * First-phase unshield-all variant: uses the on-chain confidential balance's
 * encrypted value as input, skipping the encrypted-amount path.
 */
export type UnwrapAllRequest = z.infer<typeof unwrapAllRequest>;

/**
 * Second-phase unshield. Public-decrypts `unwrapRequestIdOrAmount` during
 * `prepare` to obtain the clear value + proof, then builds the unsigned
 * `wrapper.finalizeUnwrap(handle, clear, proof)` tx. `unwrapRequestIdOrAmount`
 * comes from the `UnwrapRequested` event log (`unwrapRequestId` on upgraded
 * wrappers, the encrypted amount on legacy ones).
 */
export type FinalizeUnwrapRequest = z.infer<typeof finalizeUnwrapRequest>;

/**
 * ERC-20 `approve(spender, value)` on the underlying token, used to grant
 * the wrapper spending rights before a non-1363 `wrap`.
 *
 * For USDT-style tokens that revert on a non-zero → non-zero approval,
 * callers must issue two `ApproveUnderlying` requests in sequence
 * (`amount: 0n` then `amount: N`); check existing allowance first when
 * integrating with USDT-like underlyings.
 */
export type ApproveUnderlyingRequest = z.infer<typeof approveUnderlyingRequest>;

/** Wrapper `wrap(to, amount)` call — the second leg of the non-1363 shield path. */
export type WrapRequest = z.infer<typeof wrapRequest>;

/**
 * ERC-1363 `transferAndCall(wrapper, amount, data)` — the single-tx shield
 * path for 1363-compatible underlyings. `recipientData` is the recipient
 * encoded as 20 raw bytes (or `0x` for self-shield).
 */
export type TransferAndCallRequest = z.infer<typeof transferAndCallRequest>;

/**
 * ACL `delegateForUserDecryption(delegate, contract, expirationDate)`.
 * `expirationDate` is optional; omit for permanent (uint64.max).
 *
 * The caller-facing input type: `expirationDate` is a `Date`. The schema
 * transforms it into the on-chain `uint64` at parse time (see
 * {@link delegateDecryptionRequest}).
 */
export type DelegateDecryptionRequest = z.input<typeof delegateDecryptionRequest>;

/** ACL `revokeDelegationForUserDecryption(delegate, contract)`. */
export type RevokeDelegationRequest = z.infer<typeof revokeDelegationRequest>;

/**
 * Discriminated union of all transaction prepare requests — the caller-facing
 * input type. Uses `z.input` so members that transform at parse time (e.g.
 * {@link DelegateDecryptionRequest}, whose `expirationDate` is a `Date` on the
 * way in) present their pre-parse shape to callers.
 */
export type PrepareTransactionRequest = z.input<typeof prepareTransactionRequest>;

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
 * Inferred shape of {@link writeContractConfig} — the non-generic form of
 * {@link WriteContractConfig} (`abi`/`args` widen to `unknown[]`).
 */
export type WriteContractConfigInput = z.infer<typeof writeContractConfig>;

/**
 * Per-call chain-state overrides accepted by {@link OfflineService} methods —
 * the inferred shape of {@link prepareOptions}. Every field (`nonce`,
 * `gasLimit`, `fees`) is optional; omitted ones fall back to the provider's
 * live chain-state defaults.
 */
export type PrepareOptions = z.infer<typeof prepareOptions>;

/**
 * Inferred shape of {@link prepareTransactionParams} — the runtime-validatable
 * form of {@link GenericProvider.prepareTransaction}'s argument, with the
 * `TAbi`/`TFunctionName` generics erased.
 */
export type PrepareTransactionParams = z.infer<typeof prepareTransactionParams>;
