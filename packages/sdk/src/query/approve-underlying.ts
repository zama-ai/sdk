import type { Token } from "../token/token";
import type { Address, TransactionResult } from "../token/token.types";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link approveUnderlyingMutationOptions}. */
export interface ApproveUnderlyingParams {
  amount?: bigint;
}

export function approveUnderlyingMutationOptions(
  token: Token,
): MutationFactoryOptions<
  readonly ["approveUnderlying", Address],
  ApproveUnderlyingParams,
  TransactionResult
> {
  return {
    mutationKey: ["approveUnderlying", token.address] as const,
    mutationFn: async ({ amount }) => token.approveUnderlying(amount),
  };
}
