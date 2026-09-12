import { ZamaError, ZamaErrorCode } from "./base";
import { InvalidTransportKeyPairError } from "./credential";
import { fatalBatchErrors } from "./fatal-batch";

const callbackErrors: Partial<Record<ZamaErrorCode, new (message: string) => ZamaError>> = {
  ...fatalBatchErrors,
  [ZamaErrorCode.InvalidTransportKeyPair]: InvalidTransportKeyPairError,
};

/** Restores callback errors for SDK recovery; other codes produce a base error without subclass-specific fields. */
export function reviveZamaError(
  code: ZamaErrorCode,
  message: string,
  options: { retryable: boolean; retryAfter?: number },
): ZamaError {
  const Constructor = callbackErrors[code];
  const error = Constructor ? new Constructor(message) : new ZamaError(code, message, options);
  return Object.assign(error, options);
}
