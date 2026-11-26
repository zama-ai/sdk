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
 * tokens were delivered and there is nothing left to finalize. The SDK clears
 * the persisted pending-unshield entry before throwing, so treat this as a
 * success signal: show the unshield as complete, refresh balances, and dismiss
 * any "resume unshield" prompt.
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

/**
 * `resumeUnshield()` found no receipt for the unwrap: it is still pending, or
 * it was dropped or replaced. Its pending-unshield entry is kept; retry later.
 */
export class UnwrapNotMinedError extends ZamaError {
  /** Transaction hash of the unwrap that is not mined. */
  readonly unwrapTxHash: Hex;

  constructor(message: string, unwrapTxHash: Hex, options?: ErrorOptions) {
    super(ZamaErrorCode.UnwrapNotMined, message, options);
    this.name = "UnwrapNotMinedError";
    this.unwrapTxHash = unwrapTxHash;
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
