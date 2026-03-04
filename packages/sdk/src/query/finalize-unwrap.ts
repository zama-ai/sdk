import type { Token } from "../token/token";
import type { Address, TransactionResult } from "../token/token.types";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link finalizeUnwrapMutationOptions}. */
export interface FinalizeUnwrapParams {
  burnAmountHandle: Address;
}

export function finalizeUnwrapMutationOptions(
  token: Token,
): MutationFactoryOptions<
  readonly ["finalizeUnwrap", Address],
  FinalizeUnwrapParams,
  TransactionResult
> {
  return {
    mutationKey: ["finalizeUnwrap", token.address] as const,
    mutationFn: async ({ burnAmountHandle }) => token.finalizeUnwrap(burnAmountHandle),
  };
}
