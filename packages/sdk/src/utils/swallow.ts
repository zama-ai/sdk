import type { GenericLogger } from "../worker/worker.types";

/**
 * Runs a function and swallows any errors.
 *
 * The swallowed error is a handled, best-effort failure — it is routed to the
 * optional {@link GenericLogger} at `warn` for observability, never to the
 * console. With no logger, the failure is silent.
 */
export async function swallow(
  label: string,
  fn: () => Promise<void> | void,
  logger?: GenericLogger,
): Promise<void> {
  try {
    await fn();
  } catch (error) {
    logger?.warn(`${label} failed`, { error });
  }
}
