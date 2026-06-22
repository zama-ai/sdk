import type { LoggerService } from "../services/logger-service";

/**
 * Runs a function and swallows any errors.
 *
 * The swallowed error is a handled, best-effort failure — it is routed to the
 * optional {@link LoggerService} at `warn` for observability, never to the
 * console. With no logger, the failure is silent.
 */
export async function swallow(
  label: string,
  fn: () => Promise<void> | void,
  logger?: LoggerService,
): Promise<void> {
  try {
    await fn();
  } catch (error) {
    logger?.warn(`${label} failed`, { error });
  }
}
