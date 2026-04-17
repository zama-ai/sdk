import { SignerRequiredError } from "../errors/signer";
import type { Token } from "../token/token";
import type { TransactionResult } from "../types";
import type { MutationFactoryOptions } from "./factory-types";
import type { Address } from "viem";

/** Variables for {@link confidentialApproveMutationOptions}. */
export interface ConfidentialApproveParams {
  spender: Address;
  until?: number;
}

export function confidentialApproveMutationOptions(
  token: Token | undefined,
  tokenAddress: Address,
): MutationFactoryOptions<
  readonly ["zama.confidentialApprove", Address],
  ConfidentialApproveParams,
  TransactionResult
> {
  return {
    mutationKey: ["zama.confidentialApprove", tokenAddress] as const,
    mutationFn: async ({ spender, until }) => {
      if (!token) throw new SignerRequiredError("confidentialApprove");
      return token.approve(spender, until);
    },
  };
}
