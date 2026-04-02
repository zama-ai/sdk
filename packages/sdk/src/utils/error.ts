/** Coerce an unknown caught value to an Error instance. */
export function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  if (typeof error === "object" && error !== null && "message" in error) {
    return new Error(String(error.message));
  }
  return new Error(String(error));
}

/**
 * Returns true if the error is a contract call revert (as opposed to a network/transport error).
 * Detects viem's ContractFunctionExecutionError / ContractFunctionRevertedError
 * and ethers' CALL_EXCEPTION.
 */
export function isContractCallError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  // viem: ContractFunctionExecutionError, ContractFunctionRevertedError
  if (
    error.name === "ContractFunctionExecutionError" ||
    error.name === "ContractFunctionRevertedError"
  ) {
    return true;
  }
  // ethers: error.code === "CALL_EXCEPTION"
  if ("code" in error && error.code === "CALL_EXCEPTION") {
    return true;
  }
  // Fallback: common revert message patterns from various providers
  const msg = error.message.toLowerCase();
  if (msg.includes("execution reverted") || msg.includes("revert")) {
    return true;
  }
  return false;
}
