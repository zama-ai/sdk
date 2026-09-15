import { status } from "@grpc/grpc-js";
import { invalidArgument, SidecarError, TransactionCallbackError } from "./errors.js";
import { ZamaErrorCode } from "@zama-fhe/sdk";
import { reviveZamaError } from "@zama-fhe/sdk/internal";
import type { SdkError } from "./generated/zama/sdk/v1alpha1/sidecar.js";

export function callbackError(value: SdkError, transaction = false): Error {
  if (
    value.retryAfterSeconds !== undefined &&
    (!Number.isInteger(value.retryAfterSeconds) ||
      value.retryAfterSeconds <= 0 ||
      value.retryAfterSeconds > 0xffff_ffff)
  ) {
    return invalidArgument("Retry delay must be positive whole seconds within uint32 range.");
  }
  const code = Object.values(ZamaErrorCode).find((candidate) => candidate === value.code);
  if (code === undefined) {
    if (value.code === "4001") {
      return Object.assign(new Error(value.message), { code: 4001 });
    }
    // Codes outside the SDK taxonomy must survive the SDK's transaction wrapper; INTERNAL is the opaque
    // fallback and takes the same wrapping a direct signer would.
    const ErrorType =
      transaction && value.code !== "INTERNAL" ? TransactionCallbackError : SidecarError;
    // A possibly broadcast transaction must never look retryable, whatever the wallet reported.
    const retryable = value.retryable && value.code !== "TRANSACTION_OUTCOME_UNKNOWN";
    return new ErrorType(
      value.code,
      status.FAILED_PRECONDITION,
      value.message,
      retryable,
      retryable ? value.retryAfterSeconds : undefined,
    );
  }
  return reviveZamaError(code, value.message, {
    retryable: value.retryable,
    retryAfter: value.retryAfterSeconds,
  });
}
