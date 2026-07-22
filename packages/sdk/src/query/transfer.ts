import type { Token } from "../token/token";
import type { TransactionResult, TransferOptions } from "../types";
import type { MutationFactoryOptions } from "./factory-types";
import type { Address } from "viem";

/** Variables for {@link confidentialTransferMutationOptions}. */
export interface ConfidentialTransferParams extends TransferOptions {
  /** Recipient address. */
  to: Address;
  /** Amount of tokens to transfer, in the token's base units. */
  amount: bigint;
}

/** Builds TanStack Query mutation options for {@link Token.confidentialTransfer | transferring} confidential tokens. @see {@link ConfidentialTransferParams} */
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
