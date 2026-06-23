import type { GenericLogger } from "../worker/worker.types";

/**
 * Runs a function and swallows any errors.
 *
 * The swallowed error is a handled, best-effort failure — when a logger is
 * supplied it is routed to the {@link GenericLogger} at `warn`, never to the
 * console. Most SDK call sites pass the SDK-wide logger; a few (e.g. a signer
 * constructed before `createConfig` exists) genuinely have none, so the logger
 * is optional and the failure is then silent.
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
