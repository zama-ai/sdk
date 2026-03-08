import { Effect, Schedule } from "effect";

/**
 * Check if an error message indicates a transient/retriable failure.
 * Matches the same patterns as the old `isTransientError` in relayer-utils.ts.
 */
function isTransient(error: unknown): boolean {
  if (
    !(error instanceof Error) &&
    !(error != null && typeof error === "object" && "message" in error)
  ) {
    return false;
  }
  const msg = (error as { message: string }).message.toLowerCase();
  return (
    msg.includes("timed out") ||
    msg.includes("timeout") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("network") ||
    msg.includes("fetch failed") ||
    msg.includes("socket hang up") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504")
  );
}

const TransientSchedule = Schedule.exponential("500 millis").pipe(
  Schedule.intersect(Schedule.recurs(2)),
);

export const WhileTransient = TransientSchedule.pipe(Schedule.whileInput(isTransient));

/**
 * Wrap an effect with transient-error retry logic.
 * Retries up to 2 times with exponential backoff, but only for transient errors.
 * Non-transient errors fail immediately.
 */
export function retryTransient<A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> {
  return effect.pipe(Effect.retry(WhileTransient));
}
