import { status } from "@grpc/grpc-js";
import { SidecarError } from "./errors.js";
import { reviveZamaError, ZamaErrorCode } from "@zama-fhe/sdk";
import type { SdkError } from "./generated/zama/sdk/v1alpha1/sidecar.js";

export function callbackError(value: SdkError): Error {
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
      value.retryAfterSeconds,
    );
  }
  return reviveZamaError(code, value.message, {
    retryable: value.retryable,
    retryAfter: value.retryAfterSeconds,
  });
}
