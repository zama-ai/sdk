import type { Token } from "../token/token";
import type { Address, TransactionResult } from "../token/token.types";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link confidentialTransferFromMutationOptions}. */
export interface ConfidentialTransferFromParams {
  from: Address;
  to: Address;
  amount: bigint;
}

export function confidentialTransferFromMutationOptions(
  token: Token,
): MutationFactoryOptions<
  readonly ["confidentialTransferFrom", Address],
  ConfidentialTransferFromParams,
  TransactionResult
> {
  return {
    mutationKey: ["confidentialTransferFrom", token.address] as const,
    mutationFn: async ({ from, to, amount }) => token.confidentialTransferFrom(from, to, amount),
  };
}
