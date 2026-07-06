import type { WrappedToken } from "../token/wrapped-token";
import type { TransactionResult } from "../types";
import type { MutationFactoryOptions } from "./factory-types";
import type { Address } from "viem";

/** Variables for {@link wrapMutationOptions}. */
export interface WrapParams {
  amount: bigint;
  to?: Address;
}

export function wrapMutationOptions(
  token: WrappedToken,
): MutationFactoryOptions<readonly ["zama.wrap", Address], WrapParams, TransactionResult> {
  return {
    mutationKey: ["zama.wrap", token.address] as const,
    mutationFn: async ({ amount, to }) => token.wrap(amount, to ? { to } : undefined),
  };
}
