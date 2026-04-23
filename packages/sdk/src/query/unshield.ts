import type { Address } from "../utils/address";
import type { Token } from "../token/token";
import type { TransactionResult, UnshieldOptions } from "../types";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link unshieldMutationOptions}. */
export interface UnshieldParams extends UnshieldOptions {
  amount: bigint;
}

export function unshieldMutationOptions(
  token: Token,
): MutationFactoryOptions<readonly ["zama.unshield", Address], UnshieldParams, TransactionResult> {
  return {
    mutationKey: ["zama.unshield", token.address] as const,
    mutationFn: async ({ amount, ...options }) => token.unshield(amount, options),
  };
}
