import { hasRevert } from "../utils/error";
import type { ZamaError } from "./base";
import { HcuBlockLimitExceededError, HcuTransactionLimitExceededError } from "./transaction";

/** The `HCULimit` host contract's reverts, each with the 4-byte selector of its Solidity signature. */
const HCU_REVERTS = [
  {
    selector: "0xad251174",
    name: "HCUBlockLimitExceeded",
    ErrorClass: HcuBlockLimitExceededError,
    message: "The block's FHE compute budget (HCU) is spent. Retry in the next block.",
  },
  {
    selector: "0x77e3c293",
    name: "HCUTransactionLimitExceeded",
    ErrorClass: HcuTransactionLimitExceededError,
    message: "The transaction needs more total FHE compute (HCU) than one transaction may use.",
  },
  {
    selector: "0xfc344870",
    name: "HCUTransactionDepthLimitExceeded",
    ErrorClass: HcuTransactionLimitExceededError,
    message:
      "The transaction chains more sequential FHE compute (HCU depth) than one transaction may use.",
  },
] as const;

/**
 * Map an `HCULimit` revert to its typed error, or `null` for any other failure.
 * No SDK ABI carries these errors, so the selector is matched on the raw revert data.
 * `operation` names the failing step in the message, since one flow can send several transactions.
 * @internal
 */
export function matchHcuRevert(error: unknown, operation: string): ZamaError | null {
  const match = HCU_REVERTS.find((revert) => hasRevert(error, revert.selector, revert.name));
  return match
    ? new match.ErrorClass(`Transaction failed during ${operation}: ${match.message}`, {
        cause: error,
      })
    : null;
}
