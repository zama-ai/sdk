import type { Token } from "../token/token";
import type { Address, TransactionResult } from "../token/token.types";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link confidentialTransferMutationOptions}. */
export interface ConfidentialTransferParams {
  to: Address;
  amount: bigint;
}

export function confidentialTransferMutationOptions(
  token: Token,
): MutationFactoryOptions<
  readonly ["confidentialTransfer", Address],
  ConfidentialTransferParams,
  TransactionResult
> {
  return {
    mutationKey: ["confidentialTransfer", token.address] as const,
    mutationFn: async ({ to, amount }) => token.confidentialTransfer(to, amount),
  };
}
