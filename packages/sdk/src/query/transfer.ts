import type { Token } from "../token/token";
import type { TransferCallbacks, TransactionResult } from "../token/token.types";
import type { MutationFactoryOptions } from "./factory-types";
import type { Address } from "viem";

/** Variables for {@link confidentialTransferMutationOptions}. */
export interface ConfidentialTransferParams {
  to: Address;
  amount: bigint;
  /** Optional progress callbacks for the multi-step transfer flow. */
  callbacks?: TransferCallbacks;
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
    mutationFn: async ({ to, amount, callbacks }) =>
      token.confidentialTransfer(to, amount, callbacks),
  };
}
