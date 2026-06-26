import { ZamaError, ZamaErrorCode } from "./base";

/** Relayer HTTP request failed. */
export class RelayerRequestFailedError extends ZamaError {
  /** HTTP status code from the relayer, if available. */
  readonly statusCode: number | undefined;

  /**
   * Server-driven retry delay in milliseconds, from the relayer's `Retry-After`
   * header. Set only on back-pressure (HTTP 429) responses that carry the
   * header; `undefined` otherwise. Implies {@link retryable}.
   */
  readonly retryAfterMs: number | undefined;

  /**
   * Whether the request may be safely retried. `true` for relayer back-pressure
   * (HTTP 429); pair with {@link retryAfterMs} for the server's suggested delay.
   */
  readonly retryable: boolean;

  constructor(
    message: string,
    statusCode?: number,
    options?: ErrorOptions & { retryAfterMs?: number },
  ) {
    super(ZamaErrorCode.RelayerRequestFailed, message, options);
    this.name = "RelayerRequestFailedError";
    this.statusCode = statusCode;
    this.retryable = statusCode === 429;
    // Keep the two fields consistent: a delay only makes sense when retryable.
    this.retryAfterMs = this.retryable ? options?.retryAfterMs : undefined;
  }
}

/** SDK configuration is invalid (e.g. forbidden chain ID, unsupported type). */
export class ConfigurationError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.Configuration, message, options);
    this.name = "ConfigurationError";
  }
}
