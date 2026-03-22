/** Coerce an unknown caught value to an Error instance. */
export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
