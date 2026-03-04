import type { Token } from "../token/token";
import type { Address, TransactionResult, UnshieldCallbacks } from "../token/token.types";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link unshieldMutationOptions}. */
export interface UnshieldParams {
  amount: bigint;
  callbacks?: UnshieldCallbacks;
}

export function unshieldMutationOptions(
  token: Token,
): MutationFactoryOptions<readonly ["unshield", Address], UnshieldParams, TransactionResult> {
  return {
    mutationKey: ["unshield", token.address] as const,
    mutationFn: async ({ amount, callbacks }) => token.unshield(amount, callbacks),
  };
}
