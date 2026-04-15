import { formatUnits } from "ethers";
import {
  InsufficientConfidentialBalanceError,
  InsufficientERC20BalanceError,
  BalanceCheckUnavailableError,
} from "@zama-fhe/sdk";

/**
 * Returns a friendly message for balance-related SDK errors thrown by
 * `token.shield` / `token.confidentialTransfer` / `token.unshield`.
 *
 * New in SDK v2.3.0: these operations validate the balance before submitting
 * and throw typed errors so the UI can display precise numbers without parsing
 * revert strings.
 *
 * Falls back to `error.message` for anything the SDK did not classify.
 */
export function balanceErrorMessage(
  error: Error,
  decimals: number,
  symbol: string,
): string {
  if (
    error instanceof InsufficientERC20BalanceError ||
    error instanceof InsufficientConfidentialBalanceError
  ) {
    const requested = formatUnits(error.requested, decimals);
    const available = formatUnits(error.available, decimals);
    return `Insufficient balance — requested ${requested} ${symbol}, available ${available} ${symbol}.`;
  }
  if (error instanceof BalanceCheckUnavailableError) {
    return "Balance check unavailable — decrypt your balance first, then retry.";
  }
  return error.message;
}
