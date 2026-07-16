import type { WrappedToken } from "../token/wrapped-token";
import type { TransactionResult, WrapOptions } from "../types";
import type { MutationFactoryOptions } from "./factory-types";
import type { Address } from "viem";

/** Variables for {@link wrapMutationOptions}. */
export interface WrapParams extends WrapOptions {
  amount: bigint;
}

export function wrapMutationOptions(
  token: WrappedToken,
): MutationFactoryOptions<readonly ["zama.wrap", Address], WrapParams, TransactionResult> {
  return {
    mutationKey: ["zama.wrap", token.address] as const,
    mutationFn: async ({ amount, ...rest }) => token.wrap(amount, rest),
  };
}
