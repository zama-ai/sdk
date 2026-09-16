import { ZamaErrorCode, type ZamaError } from "./base";
import { KeyWrappingError, RevokedKmsContextError } from "./credential";
import { ConfigurationError } from "./relayer";
import { RpcRateLimitError } from "./rpc";
import { SigningRejectedError, SigningFailedError } from "./signing";

export const fatalBatchErrors = {
  [ZamaErrorCode.SigningRejected]: SigningRejectedError,
  [ZamaErrorCode.SigningFailed]: SigningFailedError,
  [ZamaErrorCode.Configuration]: ConfigurationError,
  [ZamaErrorCode.RpcRateLimited]: RpcRateLimitError,
  [ZamaErrorCode.KeyWrappingFailed]: KeyWrappingError,
  [ZamaErrorCode.RevokedKmsContext]: RevokedKmsContextError,
} satisfies Partial<Record<ZamaErrorCode, new (message: string) => ZamaError>>;

/** Systemic failures abort a batch because retrying each item would repeat the same failure. */
export function isFatalBatchError(error: unknown): boolean {
  return Object.values(fatalBatchErrors).some((Constructor) => error instanceof Constructor);
}
