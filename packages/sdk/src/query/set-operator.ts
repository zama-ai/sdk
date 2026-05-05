import type { Token } from "../token/token";
import type { TransactionResult } from "../types";
import type { MutationFactoryOptions } from "./factory-types";
import type { Address } from "viem";

/** Variables for {@link confidentialSetOperatorMutationOptions}. */
export interface ConfidentialSetOperatorParams {
  operator: Address;
  until?: number;
}

export function confidentialSetOperatorMutationOptions(
  token: Token,
): MutationFactoryOptions<
  readonly ["zama.confidentialSetOperator", Address],
  ConfidentialSetOperatorParams,
  TransactionResult
> {
  return {
    mutationKey: ["zama.confidentialSetOperator", token.address] as const,
    mutationFn: async ({ operator, until }) => token.setOperator(operator, until),
  };
}
