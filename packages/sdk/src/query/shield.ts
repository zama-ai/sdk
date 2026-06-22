import type { Address } from "viem";
import type { WrappedToken } from "../token/wrapped-token";
import type { ShieldOptions, TransactionResult } from "../types";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link shieldMutationOptions}. */
export interface ShieldParams extends ShieldOptions {
  amount: bigint;
}

export function shieldMutationOptions(
  token: WrappedToken,
): MutationFactoryOptions<readonly ["zama.shield", Address], ShieldParams, TransactionResult> {
  return {
    mutationKey: ["zama.shield", token.address] as const,
    mutationFn: async ({ amount, ...rest }) => token.shield(amount, rest),
  };
}
