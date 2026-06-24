import type { GenericLogger } from "../types";

/**
 * Internal logger with a consistent, always-present shape.
 *
 * The consumer supplies an optional {@link GenericLogger} via configuration;
 * it is wrapped once into a `LoggerService` that is threaded through the SDK.
 * Internal code therefore calls `logger.warn(...)` directly — no optional
 * chaining, no per-call `undefined` checks — and a single place (this class)
 * owns the "silent by default" behavior: when no logger was supplied, every
 * level is a no-op.
 *
 * Every message is prefixed with `[zama-sdk]` here, so call sites pass only
 * their own message (and optional component tag) without repeating the prefix.
 *
 * `LoggerService` itself satisfies `GenericLogger`, so it can be passed
 * anywhere a logger is expected (e.g. the worker client).
 */
export class LoggerService implements GenericLogger {
  readonly #logger: GenericLogger | undefined;
  readonly #prefix = "[zama-sdk]";

  constructor(logger?: GenericLogger) {
    this.#logger = logger;
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.#logger?.error(`${this.#prefix} ${message}`, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.#logger?.warn(`${this.#prefix} ${message}`, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.#logger?.info(`${this.#prefix} ${message}`, data);
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.#logger?.debug(`${this.#prefix} ${message}`, data);
  }
}
