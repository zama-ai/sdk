import type { Token } from "../token/token";
import type { Address, TransactionResult } from "../token/token.types";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link unwrapMutationOptions}. */
export interface UnwrapParams {
  amount: bigint;
}

export function unwrapMutationOptions(
  token: Token,
): MutationFactoryOptions<readonly ["unwrap", Address], UnwrapParams, TransactionResult> {
  return {
    mutationKey: ["unwrap", token.address] as const,
    mutationFn: async ({ amount }) => token.unwrap(amount),
  };
}
