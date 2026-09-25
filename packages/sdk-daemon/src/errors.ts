import { ZamaError, retryAfterSeconds as sdkRetryAfterSeconds } from "@zama-fhe/sdk";
import { Metadata, status, type ServiceError } from "@grpc/grpc-js";
import type { SdkError } from "./generated/zama/sdk/v1alpha1/sidecar.js";

export class SidecarError extends Error {
  constructor(
    readonly code: string,
    readonly grpcStatus: status,
    message: string,
    readonly retryable = false,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}
export class TransactionCallbackError extends SidecarError {}
export function invalidArgument(message = "Invalid request."): SidecarError {
  return new SidecarError("INVALID_ARGUMENT", status.INVALID_ARGUMENT, message);
}
export function cancelled(): SidecarError {
  return new SidecarError("CANCELLED", status.CANCELLED, "Operation cancelled.");
}
export function errorDetails(error: unknown): SdkError {
  // The SDK wraps wallet errors; native callers still need the broadcast outcome.
  if (error instanceof ZamaError && error.cause instanceof TransactionCallbackError) {
    return errorDetails(error.cause);
  }
  if (error instanceof ZamaError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      retryAfterSeconds: integerRetryDelay(sdkRetryAfterSeconds(error)),
    };
  }
  if (error instanceof SidecarError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      retryAfterSeconds: error.retryable ? integerRetryDelay(error.retryAfterSeconds) : undefined,
    };
  }
  return {
    code: "INTERNAL",
    message: "Operation failed.",
    retryable: false,
    retryAfterSeconds: undefined,
  };
}
export function serviceError(error: unknown): ServiceError {
  const details = errorDetails(error);
  const metadata = new Metadata();
  metadata.set("zama-error-code", details.code);
  metadata.set("zama-error-retryable", String(details.retryable));
  if (details.retryAfterSeconds !== undefined) {
    metadata.set("zama-error-retry-after-seconds", String(details.retryAfterSeconds));
  }
  const code =
    error instanceof SidecarError
      ? error.grpcStatus
      : error instanceof ZamaError
        ? status.FAILED_PRECONDITION
        : status.INTERNAL;
  return Object.assign(new Error(details.message), { code, details: details.message, metadata });
}

function integerRetryDelay(value: number | undefined): number | undefined {
  return value !== undefined && Number.isInteger(value) && value > 0 && value <= 0xffff_ffff
    ? value
    : undefined;
}
