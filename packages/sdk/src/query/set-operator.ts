import type { Token } from "../token/token";
import type { TransactionResult } from "../types";
import type { MutationFactoryOptions } from "./factory-types";
import type { Address } from "viem";

/** Variables for {@link confidentialSetOperatorMutationOptions}. */
export interface ConfidentialSetOperatorParams {
  /** Operator address to authorize. */
  operator: Address;
  /** Unix timestamp (seconds) when the operator authorization expires; defaults to one hour from now. */
  until?: number;
}

/** Builds TanStack Query mutation options for {@link Token.setOperator | authorizing} an operator on a confidential token. @see {@link ConfidentialSetOperatorParams} */
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
