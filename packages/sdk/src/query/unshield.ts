import type { WrappedToken } from "../token/wrapped-token";
import type { TransactionResult, UnshieldOptions } from "../types";
import type { MutationFactoryOptions } from "./factory-types";
import type { Address } from "viem";

/** Variables for {@link unshieldMutationOptions}. */
export interface UnshieldParams extends UnshieldOptions {
  /** Amount of tokens to unshield, in the token's base units. */
  amount: bigint;
}

/** Builds TanStack Query mutation options for {@link WrappedToken.unshield | unshielding} a confidential token back into its public ERC-20. @see {@link UnshieldParams} */
export function unshieldMutationOptions(
  token: WrappedToken,
): MutationFactoryOptions<readonly ["zama.unshield", Address], UnshieldParams, TransactionResult> {
  return {
    mutationKey: ["zama.unshield", token.address] as const,
    mutationFn: async ({ amount, ...options }) => token.unshield(amount, options),
  };
}
