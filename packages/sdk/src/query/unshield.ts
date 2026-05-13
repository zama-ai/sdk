import type { WrappedToken } from "../token/wrapped-token";
import type { TransactionResult, UnshieldOptions } from "../types";
import type { MutationFactoryOptions } from "./factory-types";
import type { Address } from "viem";

/** Variables for {@link unshieldMutationOptions}. */
export interface UnshieldParams extends UnshieldOptions {
  amount: bigint;
}

export function unshieldMutationOptions(
  token: WrappedToken,
): MutationFactoryOptions<readonly ["zama.unshield", Address], UnshieldParams, TransactionResult> {
  return {
    mutationKey: ["zama.unshield", token.address] as const,
    mutationFn: async ({ amount, ...options }) => token.unshield(amount, options),
  };
}
