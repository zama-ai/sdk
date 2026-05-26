import { ZamaError, ZamaErrorCode } from "./base";

/** Relayer HTTP request failed. */
export class RelayerRequestFailedError extends ZamaError {
  /** HTTP status code from the relayer, if available. */
  readonly statusCode: number | undefined;

  constructor(message: string, statusCode?: number, options?: ErrorOptions) {
    super(ZamaErrorCode.RelayerRequestFailed, message, options);
    this.name = "RelayerRequestFailedError";
    this.statusCode = statusCode;
  }
}

/** SDK configuration is invalid (e.g. forbidden chain ID, unsupported type). */
export class ConfigurationError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.Configuration, message, options);
    this.name = "ConfigurationError";
  }
}

/**
 * Web Worker runtime is not available in this environment.
 *
 * Thrown when the `web()` relayer is used outside a browser (e.g. during
 * Next.js server-side rendering). Callers that perform eager warmup should
 * treat this as expected: warmup is irrelevant in non-browser environments
 * since the SDK will be reconstructed once the app hydrates client-side.
 */
export class WorkerUnavailableError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.WorkerUnavailable, message, options);
    this.name = "WorkerUnavailableError";
  }
}
