import { keccak256, toBytes, type Hex } from "viem";
import type { EncryptedValue } from "../relayer/types";
import { ZamaError, ZamaErrorCode } from "./base";
import { extractRevertErrorName } from "./revert";

/** Structured details identifying the consumed unwrap request. */
export interface UnshieldAlreadyFinalizedDetails {
  /** Transaction hash of the original unwrap request. */
  readonly unwrapTxHash: Hex;
  /** Request identifier from the `UnwrapRequested` event. */
  readonly unwrapRequestId: EncryptedValue;
}

/**
 * The unwrap request was already finalized on-chain: the underlying ERC-20
 * tokens were delivered and there is nothing left to resume. The SDK clears
 * the persisted pending-unshield pointer before throwing, so treat this as a
 * success signal: refresh balances and dismiss any "resume unshield" prompt.
 */
export class UnshieldAlreadyFinalizedError extends ZamaError {
  /** Transaction hash of the original unwrap request. */
  readonly unwrapTxHash: Hex;
  /** Request identifier from the `UnwrapRequested` event. */
  readonly unwrapRequestId: EncryptedValue;

  constructor(message: string, details: UnshieldAlreadyFinalizedDetails, options?: ErrorOptions) {
    super(ZamaErrorCode.UnshieldAlreadyFinalized, message, options);
    this.name = "UnshieldAlreadyFinalizedError";
    this.unwrapTxHash = details.unwrapTxHash;
    this.unwrapRequestId = details.unwrapRequestId;
  }
}

const INVALID_UNWRAP_REQUEST = "InvalidUnwrapRequest";
const INVALID_UNWRAP_REQUEST_SELECTOR = keccak256(
  toBytes(`${INVALID_UNWRAP_REQUEST}(bytes32)`),
).slice(0, 10);

/**
 * True if `error` (or anything on its `cause` chain) is the wrapper's
 * `InvalidUnwrapRequest` custom revert. Prefers viem's structured
 * `cause.data.errorName`, falling back to message matching on the error name
 * and the raw 4-byte selector for non-viem providers.
 * @internal
 */
export function isInvalidUnwrapRequestRevert(error: unknown): boolean {
  for (let current = error; current instanceof Error; current = current.cause) {
    if (extractRevertErrorName(current) === INVALID_UNWRAP_REQUEST) {
      return true;
    }
    if (
      current.message.includes(INVALID_UNWRAP_REQUEST) ||
      current.message.includes(INVALID_UNWRAP_REQUEST_SELECTOR)
    ) {
      return true;
    }
  }
  return false;
}
