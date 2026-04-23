import type { Address } from "../utils/address";
import type { Token } from "../token/token";
import type { TransactionResult } from "../types";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link unwrapMutationOptions}. */
export interface UnwrapParams {
  amount: bigint;
}

export function unwrapMutationOptions(
  token: Token,
): MutationFactoryOptions<readonly ["zama.unwrap", Address], UnwrapParams, TransactionResult> {
  return {
    mutationKey: ["zama.unwrap", token.address] as const,
    mutationFn: async ({ amount }) => token.unwrap(amount),
  };
}
