import type { Token } from "../token/token";
import type { TransferCallbacks, TransactionResult } from "../types";
import type { MutationFactoryOptions } from "./factory-types";
import type { Address } from "viem";

/** Variables for {@link confidentialTransferFromMutationOptions}. */
export interface ConfidentialTransferFromParams {
  /** Address to transfer from. */
  from: Address;
  /** Recipient address. */
  to: Address;
  /** Amount of tokens to transfer, in the token's base units. */
  amount: bigint;
  /** Optional progress callbacks for the multi-step transfer flow. */
  callbacks?: TransferCallbacks;
}

/** Builds TanStack Query mutation options for {@link Token.confidentialTransferFrom | transferring} confidential tokens from another account (operator flow). @see {@link ConfidentialTransferFromParams} */
export function confidentialTransferFromMutationOptions(
  token: Token,
): MutationFactoryOptions<
  readonly ["zama.confidentialTransferFrom", Address],
  ConfidentialTransferFromParams,
  TransactionResult
> {
  return {
    mutationKey: ["zama.confidentialTransferFrom", token.address] as const,
    mutationFn: async ({ from, to, amount, callbacks }) =>
      token.confidentialTransferFrom(from, to, amount, callbacks),
  };
}
