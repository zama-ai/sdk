import type { Token } from "../token/token";
import type { TransferCallbacks, TransactionResult } from "../token/token.types";
import type { MutationFactoryOptions } from "./factory-types";
import type { Address } from "viem";

/** Variables for {@link confidentialTransferMutationOptions}. */
export interface ConfidentialTransferParams extends TransferCallbacks {
  to: Address;
  amount: bigint;
  /** Skip confidential balance validation (e.g. for smart wallets). Default: `false`. */
  skipBalanceCheck?: boolean;
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
