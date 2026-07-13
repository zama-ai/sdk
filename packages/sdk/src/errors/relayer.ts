import { ZamaError, ZamaErrorCode } from "./base";

/** Relayer HTTP request failed. */
export class RelayerRequestFailedError extends ZamaError {
  /** HTTP status code from the relayer, if available. */
  readonly statusCode: number | undefined;

  /**
   * Server-driven retry delay in **seconds** (the SDK's duration unit and the
   * header's own unit), from the relayer's `Retry-After` header. Set only on
   * back-pressure (HTTP 429) responses that carry the header; `undefined`
   * otherwise. Implies {@link ZamaError.retryable}.
   */
  readonly retryAfter: number | undefined;

  constructor(
    message: string,
    statusCode?: number,
    options?: ErrorOptions & { retryAfter?: number; retryable?: boolean },
  ) {
    // Retryable on relayer back-pressure (HTTP 429) by default, or when the
    // caller forces it (a relayer timeout has no status but is safe to retry).
    const retryable = options?.retryable ?? statusCode === 429;
    super(ZamaErrorCode.RelayerRequestFailed, message, { ...options, retryable });
    this.name = "RelayerRequestFailedError";
    this.statusCode = statusCode;
    // Keep the two fields consistent: a delay only makes sense when retryable,
    // and only a 429 actually carries a server-supplied `Retry-After`.
    this.retryAfter = retryable ? options?.retryAfter : undefined;
  }
}

/** SDK configuration is invalid (e.g. forbidden chain ID, unsupported type). */
export class ConfigurationError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.Configuration, message, options);
    this.name = "ConfigurationError";
  }
}
