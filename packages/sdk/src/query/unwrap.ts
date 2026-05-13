import type { WrappedToken } from "../token/wrapped-token";
import type { TransactionResult, UnwrapOptions } from "../types";
import type { MutationFactoryOptions } from "./factory-types";
import type { Address } from "viem";

/** Variables for {@link unwrapMutationOptions}. */
export interface UnwrapParams extends UnwrapOptions {
  amount: bigint;
}

export function unwrapMutationOptions(
  token: WrappedToken,
): MutationFactoryOptions<readonly ["zama.unwrap", Address], UnwrapParams, TransactionResult> {
  return {
    mutationKey: ["zama.unwrap", token.address] as const,
    mutationFn: async ({ amount, ...options }) => token.unwrap(amount, options),
  };
}
