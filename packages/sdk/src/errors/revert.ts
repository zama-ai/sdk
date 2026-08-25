/**
 * Extract the decoded custom error name from a viem ContractFunctionRevertedError,
 * or `null` when the error carries no structured revert data.
 * @internal
 */
export function extractRevertErrorName(error: unknown): string | null {
  if (!(error instanceof Error)) {
    return null;
  }
  const cause = error.cause;
  if (typeof cause !== "object" || cause === null || !("data" in cause)) {
    return null;
  }
  const { data } = cause;
  if (typeof data !== "object" || data === null || !("errorName" in data)) {
    return null;
  }
  return typeof data.errorName === "string" ? data.errorName : null;
}
