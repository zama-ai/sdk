import { status } from "@grpc/grpc-js";
import { invalidArgument, SidecarError } from "./errors.js";
import { ZamaErrorCode } from "@zama-fhe/sdk";
import { reviveZamaError } from "@zama-fhe/sdk/internal";
import type { SdkError } from "./generated/zama/sdk/v1alpha1/sidecar.js";

export function callbackError(value: SdkError): Error {
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
    return new SidecarError(
      value.code,
      status.FAILED_PRECONDITION,
      value.message,
      value.retryable,
      value.retryable ? value.retryAfterSeconds : undefined,
    );
  }
  return reviveZamaError(code, value.message, {
    retryable: value.retryable,
    retryAfter: value.retryAfterSeconds,
  });
}
