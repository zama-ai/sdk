import type { Address } from "../utils/address";
import type { Token } from "../token/token";
import type { ShieldCallbacks, TransactionResult } from "../types";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link shieldMutationOptions}. */
export interface ShieldParams extends ShieldCallbacks {
  amount: bigint;
  approvalStrategy?: "max" | "exact" | "skip";
  /** Recipient address for the shielded tokens. Defaults to the connected wallet. */
  to?: Address;
}

export function shieldMutationOptions(
  token: Token,
): MutationFactoryOptions<readonly ["zama.shield", Address], ShieldParams, TransactionResult> {
  return {
    mutationKey: ["zama.shield", token.address] as const,
    mutationFn: async ({ amount, ...rest }) => token.shield(amount, rest),
  };
}
