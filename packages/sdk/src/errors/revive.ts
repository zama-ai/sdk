import { isValidRetryAfterSeconds } from "../utils/error";
import { ZamaError, ZamaErrorCode } from "./base";
import { fatalBatchErrors } from "./fatal-batch";

const callbackErrors: Partial<Record<ZamaErrorCode, new (message: string) => ZamaError>> =
  fatalBatchErrors;

/** Restores callback failures whose class identity controls batch termination. */
export function reviveZamaError(
  code: ZamaErrorCode,
  message: string,
  options: { retryable: boolean; retryAfter?: number },
): ZamaError {
  const Constructor = callbackErrors[code];
  const error = Constructor
    ? new Constructor(message)
    : new ZamaError(
        code,
        message,
        code === ZamaErrorCode.RelayerRequestFailed ? { retryable: options.retryable } : undefined,
      );
  if (error.retryable && isValidRetryAfterSeconds(options.retryAfter)) {
    return Object.assign(error, { retryAfter: options.retryAfter });
  }
  return error;
}
