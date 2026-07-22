import type { WrappedToken } from "../token/wrapped-token";
import type { TransactionResult } from "../types";
import type { MutationFactoryOptions } from "./factory-types";
import type { Address } from "viem";

/** Variables for {@link approveUnderlyingMutationOptions}. */
export interface ApproveUnderlyingParams {
  /** Amount of the underlying ERC-20 to approve, in its base units; omit for a max approval. */
  amount?: bigint;
}

/** Builds TanStack Query mutation options for {@link WrappedToken.approveUnderlying | approving} the wrapper to spend the underlying ERC-20. @see {@link ApproveUnderlyingParams} */
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
