import { ZamaError, ZamaErrorCode } from "./base";

/** Relayer HTTP request failed. */
export class RelayerRequestFailedError extends ZamaError {
  /** HTTP status code from the relayer, if available. */
  readonly statusCode: number | undefined;

  /**
   * Server-driven retry delay in milliseconds, from the relayer's `Retry-After`
   * header. Present on rate-limited (429) responses that carry the header;
   * `undefined` otherwise.
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
    this.retryAfterMs = options?.retryAfterMs;
    this.retryable = statusCode === 429;
  }
}

/** SDK configuration is invalid (e.g. forbidden chain ID, unsupported type). */
export class ConfigurationError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.Configuration, message, options);
    this.name = "ConfigurationError";
  }
}
