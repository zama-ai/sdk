import { size } from "viem";
import { z } from "zod/mini";
import type {
  ApproveUnderlyingRequest,
  ConfidentialTransferFromRequest,
  ConfidentialTransferRequest,
  DelegateDecryptionRequest,
  FinalizeUnwrapRequest,
  PrepareOptions,
  PrepareTransactionRequest,
  RevokeDelegationRequest,
  SetOperatorRequest,
  TransferAndCallRequest,
  UnwrapAllRequest,
  UnwrapRequest,
  WrapRequest,
  WriteContractConfig,
} from "../types";
import { checksummedAddress, hex, unixSeconds } from "./primitives";

/**
 * {@link ConfidentialTransferRequest} schema.
 * @internal
 */
export const confidentialTransferRequest = z.object({
  kind: z.literal("ConfidentialTransfer"),
  from: checksummedAddress,
  token: checksummedAddress,
  to: checksummedAddress,
  amount: z.bigint(),
}) satisfies z.ZodMiniType<ConfidentialTransferRequest>;

/**
 * {@link ConfidentialTransferFromRequest} schema.
 * @internal
 */
export const confidentialTransferFromRequest = z.object({
  kind: z.literal("ConfidentialTransferFrom"),
  from: checksummedAddress,
  token: checksummedAddress,
  owner: checksummedAddress,
  to: checksummedAddress,
  amount: z.bigint(),
}) satisfies z.ZodMiniType<ConfidentialTransferFromRequest>;

/**
 * {@link SetOperatorRequest} schema. `until` is a required unix timestamp
 * (seconds); pass `0 < until < now` to revoke.
 * @internal
 */
export const setOperatorRequest = z.object({
  kind: z.literal("SetOperator"),
  from: checksummedAddress,
  token: checksummedAddress,
  operator: checksummedAddress,
  until: unixSeconds,
}) satisfies z.ZodMiniType<SetOperatorRequest>;

/**
 * {@link UnwrapRequest} schema.
 * @internal
 */
export const unwrapRequest = z.object({
  kind: z.literal("Unwrap"),
  from: checksummedAddress,
  token: checksummedAddress,
  to: checksummedAddress,
  amount: z.bigint(),
}) satisfies z.ZodMiniType<UnwrapRequest>;

/**
 * {@link UnwrapAllRequest} schema.
 * @internal
 */
export const unwrapAllRequest = z.object({
  kind: z.literal("UnwrapAll"),
  from: checksummedAddress,
  token: checksummedAddress,
  to: checksummedAddress,
}) satisfies z.ZodMiniType<UnwrapAllRequest>;

/**
 * {@link FinalizeUnwrapRequest} schema.
 * @internal
 */
export const finalizeUnwrapRequest = z.object({
  kind: z.literal("FinalizeUnwrap"),
  from: checksummedAddress,
  wrapper: checksummedAddress,
  unwrapRequestIdOrAmount: hex,
}) satisfies z.ZodMiniType<FinalizeUnwrapRequest>;

/**
 * {@link ApproveUnderlyingRequest} schema.
 * @internal
 */
export const approveUnderlyingRequest = z.object({
  kind: z.literal("ApproveUnderlying"),
  from: checksummedAddress,
  underlying: checksummedAddress,
  spender: checksummedAddress,
  amount: z.bigint(),
}) satisfies z.ZodMiniType<ApproveUnderlyingRequest>;

/**
 * {@link WrapRequest} schema.
 * @internal
 */
export const wrapRequest = z.object({
  kind: z.literal("Wrap"),
  from: checksummedAddress,
  wrapper: checksummedAddress,
  to: checksummedAddress,
  amount: z.bigint(),
}) satisfies z.ZodMiniType<WrapRequest>;

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

/**
 * {@link TransferAndCallRequest} schema. `recipientData` is 20 raw bytes or `0x`.
 * @internal
 */
export const transferAndCallRequest = z.object({
  kind: z.literal("TransferAndCall"),
  from: checksummedAddress,
  underlying: checksummedAddress,
  wrapper: checksummedAddress,
  amount: z.bigint(),
  recipientData: z.optional(recipientData),
}) satisfies z.ZodMiniType<TransferAndCallRequest>;

/**
 * {@link DelegateDecryptionRequest} schema. Input takes an optional
 * `expirationDate` (a `Date`); the parsed output is the on-chain `uint64`
 * expiry — seconds since epoch, or `MAX_UINT64` ("permanent") when omitted —
 * so callers never hand-roll the encoding.
 *
 * The ≥1h-in-the-future expiry check and the self/contract guards live in the
 * `#buildDelegateDecryption` builder (they throw domain-specific delegation
 * errors this schema can't).
 * @internal
 */
export const delegateDecryptionRequest = z.object({
  kind: z.literal("DelegateDecryption"),
  from: checksummedAddress,
  contractAddress: checksummedAddress,
  delegateAddress: checksummedAddress,
  expirationDate: z.optional(z.date()),
}) satisfies z.ZodMiniType<DelegateDecryptionRequest>;

/**
 * {@link RevokeDelegationRequest} schema.
 * @internal
 */
export const revokeDelegationRequest = z.object({
  kind: z.literal("RevokeDelegation"),
  from: checksummedAddress,
  contractAddress: checksummedAddress,
  delegateAddress: checksummedAddress,
}) satisfies z.ZodMiniType<RevokeDelegationRequest>;

/**
 * Discriminated union (on `kind`) of every offline `prepare` request. Backs
 * both the {@link PrepareTransactionRequest} type and the runtime validation
 * in `OfflineService.prepare`.
 * @internal
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
]) satisfies z.ZodMiniType<PrepareTransactionRequest>;

/**
 * {@link PrepareFees} schema. `maxFeePerGas` and `maxPriorityFeePerGas` live in
 * one object so they can only be supplied together — pinning a cap (the total
 * fee) while the tip is estimated can produce a tip above the cap and fail
 * serialization. Both legs are validated as `bigint` so a JS caller (no
 * compiler) can't slip a `number` into the frozen, signed payload.
 * @internal
 */
export const fees = z.strictObject({ maxFeePerGas: z.bigint(), maxPriorityFeePerGas: z.bigint() });

/**
 * {@link PrepareOptions} schema. All fields are optional; omitted ones fall
 * back to the provider's live chain-state defaults.
 * @internal
 */
export const prepareOptions = z.object({
  nonce: z.optional(z.int().check(z.nonnegative())),
  gasLimit: z.optional(z.bigint()),
  fees: z.optional(fees),
}) satisfies z.ZodMiniType<PrepareOptions>;

/**
 * `WriteContractConfig` schema. `abi` and `args` are validated only as
 * arrays — their element shapes are the ABI-typed `TAbi`/`TFunctionName`
 * generics the runtime can't check — so this guards the structural envelope
 * (address, function name, the two arrays, optional `value`/`gas`) a provider's
 * tx-builder consumes.
 * @internal
 */
export const writeContractConfig = z.object({
  address: checksummedAddress,
  abi: z.array(z.unknown()),
  functionName: z.string(),
  args: z.array(z.unknown()),
  value: z.optional(z.bigint()),
  gas: z.optional(z.bigint()),
}) satisfies z.ZodMiniType<WriteContractConfig>;

/**
 * Schema for the argument object of `GenericProvider.prepareTransaction`:
 * the originating `from` wallet, the write-contract `calldata`, and the
 * optional chain-state overrides. Extends {@link prepareOptions} so the
 * `nonce`/`gasLimit`/`fees` legs stay in lockstep with the per-call overrides.
 *
 * `from` is EIP-55 checksummed on parse (the custodian keys off it), so the
 * validated output can flow straight into the prepared handoff.
 * @internal
 */
export const prepareTransactionParams = z.extend(prepareOptions, {
  from: checksummedAddress,
  calldata: writeContractConfig,
});
