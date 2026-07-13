import { ZamaError, ZamaErrorCode } from "./base";

/** Relayer HTTP request failed. */
export class RelayerRequestFailedError extends ZamaError {
  /** HTTP status code from the relayer, if available. */
  readonly statusCode: number | undefined;

  /**
   * Server-driven retry delay in **seconds** (the SDK's duration unit and the
   * header's own unit), from the relayer's `Retry-After` header. Set only on
   * back-pressure (HTTP 429) responses that carry the header; `undefined`
   * otherwise. Implies {@link retryable}.
   */
  readonly retryAfter: number | undefined;

  /**
   * Whether the request may be safely retried. `true` for relayer back-pressure
   * (HTTP 429) — pair with {@link retryAfter} for the server's suggested delay —
   * and for a relayer timeout (which carries no status but is safe to retry, via
   * the `retryable` option). `false` for terminal failures (e.g. a 4xx/5xx).
   */
  readonly retryable: boolean;

  constructor(
    message: string,
    statusCode?: number,
    options?: ErrorOptions & { retryAfter?: number; retryable?: boolean },
  ) {
    super(ZamaErrorCode.RelayerRequestFailed, message, options);
    this.name = "RelayerRequestFailedError";
    this.statusCode = statusCode;
    // Retryable on relayer back-pressure (HTTP 429) by default, or when the
    // caller forces it (a relayer timeout has no status but is safe to retry).
    this.retryable = options?.retryable ?? statusCode === 429;
    // Keep the two fields consistent: a delay only makes sense when retryable,
    // and only a 429 actually carries a server-supplied `Retry-After`.
    this.retryAfter = this.retryable ? options?.retryAfter : undefined;
  }
}

/** SDK configuration is invalid (e.g. forbidden chain ID, unsupported type). */
export class ConfigurationError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.Configuration, message, options);
    this.name = "ConfigurationError";
  }
}
