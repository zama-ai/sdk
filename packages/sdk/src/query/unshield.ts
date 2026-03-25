import type { Token } from "../token/token";
import type { TransactionResult, UnshieldCallbacks } from "../types";
import type { MutationFactoryOptions } from "./factory-types";
import type { Address } from "viem";

/** Variables for {@link unshieldMutationOptions}. */
export interface UnshieldParams {
  amount: bigint;
  callbacks?: UnshieldCallbacks;
}

export function unshieldMutationOptions(
  token: Token,
): MutationFactoryOptions<readonly ["zama.unshield", Address], UnshieldParams, TransactionResult> {
  return {
    mutationKey: ["zama.unshield", token.address] as const,
    mutationFn: async ({ amount, callbacks }) => token.unshield(amount, callbacks),
  };
}
