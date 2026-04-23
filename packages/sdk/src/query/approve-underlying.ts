import type { Address } from "../utils/address";
import type { Token } from "../token/token";
import type { TransactionResult } from "../types";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link approveUnderlyingMutationOptions}. */
export interface ApproveUnderlyingParams {
  amount?: bigint;
}

export function approveUnderlyingMutationOptions(
  token: Token,
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
