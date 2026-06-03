import type { WrappedToken } from "../token/wrapped-token";
import type { TransactionResult } from "../types";
import type { MutationFactoryOptions } from "./factory-types";
import type { Address } from "viem";

/** Variables for {@link unwrapMutationOptions}. */
export interface UnwrapParams {
  amount: bigint;
}

export function unwrapMutationOptions(
  token: WrappedToken,
): MutationFactoryOptions<readonly ["zama.unwrap", Address], UnwrapParams, TransactionResult> {
  return {
    mutationKey: ["zama.unwrap", token.address] as const,
    mutationFn: async ({ amount }) => token.unwrap(amount),
  };
}
