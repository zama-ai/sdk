import type { WrappedToken } from "../token/wrapped-token";
import type { TransactionResult } from "../types";
import type { MutationFactoryOptions } from "./factory-types";
import type { Address } from "viem";

/** Variables for {@link approveUnderlyingMutationOptions}. */
export interface ApproveUnderlyingParams {
  amount?: bigint;
}

export function approveUnderlyingMutationOptions(
  token: WrappedToken,
): MutationFactoryOptions<
  readonly ["zama.approveUnderlying", Address],
  ApproveUnderlyingParams,
  TransactionResult
> {
  return {
    mutationKey: ["zama.approveUnderlying", token.address] as const,
    mutationFn: async ({ amount }) => token.approveUnderlying(amount),
  };
}
