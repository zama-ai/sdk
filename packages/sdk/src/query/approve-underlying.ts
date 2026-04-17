import { SignerRequiredError } from "../errors/signer";
import type { Token } from "../token/token";
import type { TransactionResult } from "../types";
import type { MutationFactoryOptions } from "./factory-types";
import type { Address } from "viem";

/** Variables for {@link approveUnderlyingMutationOptions}. */
export interface ApproveUnderlyingParams {
  amount?: bigint;
}

export function approveUnderlyingMutationOptions(
  token: Token | undefined,
  tokenAddress: Address,
): MutationFactoryOptions<
  readonly ["zama.approveUnderlying", Address],
  ApproveUnderlyingParams,
  TransactionResult
> {
  return {
    mutationKey: ["zama.approveUnderlying", tokenAddress] as const,
    mutationFn: async ({ amount }) => {
      if (!token) throw new SignerRequiredError("approveUnderlying");
      return token.approveUnderlying(amount);
    },
  };
}
