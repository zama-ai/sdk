import type { Token } from "../token/token";
import type { Address, TransactionResult } from "../token/token.types";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link confidentialApproveMutationOptions}. */
export interface ConfidentialApproveParams {
  spender: Address;
  until?: number;
}

export function confidentialApproveMutationOptions(
  token: Token,
): MutationFactoryOptions<
  readonly ["zama.confidentialApprove", Address],
  ConfidentialApproveParams,
  TransactionResult
> {
  return {
    mutationKey: ["zama.confidentialApprove", token.address] as const,
    mutationFn: async ({ spender, until }) => token.approve(spender, until),
  };
}
