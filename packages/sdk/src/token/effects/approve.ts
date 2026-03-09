import { Effect } from "effect";
import type { Address } from "../../relayer/relayer-sdk.types";
import { Signer } from "../../services/Signer";
import { EventEmitter } from "../../services/EventEmitter";
import { ApprovalFailed } from "../../errors";
import { ZamaSDKEvents } from "../../events/sdk-events";
import {
  setOperatorContract,
  isOperatorContract,
  approveContract,
  allowanceContract,
  underlyingContract,
} from "../../contracts";
import { validateAddress } from "../../utils";

/** Coerce an unknown caught value to an Error instance. */
function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Set operator approval for the confidential token.
 * Defaults to 1 hour from now if `until` is not specified.
 */
export function approveEffect(tokenAddress: Address, spender: Address, until?: number) {
  return Effect.gen(function* () {
    const signer = yield* Signer;
    const emitter = yield* EventEmitter;
    const normalizedSpender = validateAddress(spender, "spender");

    const txHash = yield* signer
      .writeContract(setOperatorContract(tokenAddress, normalizedSpender, until))
      .pipe(
        Effect.tapError((e) =>
          emitter.emit({
            type: ZamaSDKEvents.TransactionError,
            operation: "approve",
            error: toError(e),
          }),
        ),
        Effect.mapError(
          (e) => new ApprovalFailed({ message: "Operator approval failed", cause: e.cause }),
        ),
      );

    yield* emitter.emit({ type: ZamaSDKEvents.ApproveSubmitted, txHash });
    const receipt = yield* signer
      .waitForTransactionReceipt(txHash)
      .pipe(
        Effect.mapError(
          (e) => new ApprovalFailed({ message: "Operator approval failed", cause: e.cause }),
        ),
      );

    return { txHash, receipt };
  });
}

/**
 * Check if a spender is an approved operator for a given holder.
 */
export function isApprovedEffect(tokenAddress: Address, spender: Address, holder?: Address) {
  return Effect.gen(function* () {
    const signer = yield* Signer;
    const normalizedSpender = validateAddress(spender, "spender");
    const resolvedHolder = holder ? validateAddress(holder, "holder") : yield* signer.getAddress();
    return yield* signer.readContract<boolean>(
      isOperatorContract(tokenAddress, resolvedHolder, normalizedSpender),
    );
  });
}

/**
 * Approve this token contract to spend the underlying ERC-20.
 * Resets to zero first if there's an existing non-zero allowance.
 */
export function approveUnderlyingEffect(wrapperAddress: Address, amount?: bigint) {
  return Effect.gen(function* () {
    const signer = yield* Signer;
    const emitter = yield* EventEmitter;

    const underlying = yield* signer.readContract<Address>(underlyingContract(wrapperAddress));
    const approvalAmount = amount ?? 2n ** 256n - 1n;

    if (approvalAmount > 0n) {
      const userAddress = yield* signer.getAddress();
      const currentAllowance = yield* signer.readContract<bigint>(
        allowanceContract(underlying, userAddress, wrapperAddress),
      );

      if (currentAllowance > 0n) {
        yield* signer
          .writeContract(approveContract(underlying, wrapperAddress, 0n))
          .pipe(
            Effect.mapError(
              (e) =>
                new ApprovalFailed({ message: "ERC-20 approval reset failed", cause: e.cause }),
            ),
          );
      }
    }

    const txHash = yield* signer
      .writeContract(approveContract(underlying, wrapperAddress, approvalAmount))
      .pipe(
        Effect.tapError((e) =>
          emitter.emit({
            type: ZamaSDKEvents.TransactionError,
            operation: "approveUnderlying",
            error: toError(e),
          }),
        ),
        Effect.mapError(
          (e) => new ApprovalFailed({ message: "ERC-20 approval failed", cause: e.cause }),
        ),
      );

    yield* emitter.emit({ type: ZamaSDKEvents.ApproveUnderlyingSubmitted, txHash });
    const receipt = yield* signer
      .waitForTransactionReceipt(txHash)
      .pipe(
        Effect.mapError(
          (e) => new ApprovalFailed({ message: "ERC-20 approval failed", cause: e.cause }),
        ),
      );

    return { txHash, receipt };
  });
}
