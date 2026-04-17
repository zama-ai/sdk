import type { Token } from "../token/token";
import type { TransferCallbacks, TransactionResult } from "../types";
import type { MutationFactoryOptions } from "./factory-types";
import type { Address } from "viem";

/** Variables for {@link confidentialTransferFromMutationOptions}. */
export interface ConfidentialTransferFromParams {
  from: Address;
  to: Address;
  amount: bigint;
  /** Optional progress callbacks for the multi-step transfer flow. */
  callbacks?: TransferCallbacks;
}

export function confidentialTransferFromMutationOptions(
  token: Token,
): MutationFactoryOptions<
  readonly ["zama.confidentialTransferFrom", Address],
  ConfidentialTransferFromParams,
  TransactionResult
> {
  return {
    mutationKey: ["zama.confidentialTransferFrom", token.address] as const,
    mutationFn: async ({ from, to, amount, callbacks }) => {
      return token.confidentialTransferFrom(from, to, amount, callbacks);
    },
  };
}
