import type { Token } from "../token/token";
import type { TransactionResult, TransferOptions } from "../types";
import type { MutationFactoryOptions } from "./factory-types";
import type { Address } from "viem";

/** Variables for {@link confidentialTransferMutationOptions}. */
export interface ConfidentialTransferParams extends TransferOptions {
  to: Address;
  amount: bigint;
}

export function confidentialTransferMutationOptions(
  token: Token,
): MutationFactoryOptions<
  readonly ["zama.confidentialTransfer", Address],
  ConfidentialTransferParams,
  TransactionResult
> {
  return {
    mutationKey: ["zama.confidentialTransfer", token.address] as const,
    mutationFn: async ({ to, amount, ...options }) =>
      token.confidentialTransfer(to, amount, options),
  };
}
