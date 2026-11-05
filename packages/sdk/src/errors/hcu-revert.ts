import { hasRevert } from "../utils/error";
import type { ZamaError } from "./base";
import { HcuBlockLimitExceededError, HcuTransactionLimitExceededError } from "./transaction";

/** The `HCULimit` host contract's reverts, each with the 4-byte selector of its Solidity signature. */
const HCU_REVERTS = [
  {
    selector: "0xad251174",
    name: "HCUBlockLimitExceeded",
    error: (cause: unknown) =>
      new HcuBlockLimitExceededError(
        "The block's FHE compute budget (HCU) is spent. Retry in the next block.",
        { cause },
      ),
  },
  {
    selector: "0x77e3c293",
    name: "HCUTransactionLimitExceeded",
    error: (cause: unknown) =>
      new HcuTransactionLimitExceededError(
        "The transaction needs more total FHE compute (HCU) than one transaction may use.",
        { cause },
      ),
  },
  {
    selector: "0xfc344870",
    name: "HCUTransactionDepthLimitExceeded",
    error: (cause: unknown) =>
      new HcuTransactionLimitExceededError(
        "The transaction chains more sequential FHE compute (HCU depth) than one transaction may use.",
        { cause },
      ),
  },
] as const;

/**
 * Map an `HCULimit` revert to its typed error, or `null` for any other failure.
 * No SDK ABI carries these errors, so the selector is matched on the raw revert data.
 * @internal
 */
export function matchHcuRevert(error: unknown): ZamaError | null {
  const match = HCU_REVERTS.find((revert) => hasRevert(error, revert.selector, revert.name));
  return match ? match.error(error) : null;
}
