import type { Token } from "../token/token";
import type { ShieldOptions, TransactionResult } from "../types";
import type { MutationFactoryOptions } from "./factory-types";
import type { Address } from "viem";

/** Variables for {@link shieldMutationOptions}. */
export interface ShieldParams extends ShieldOptions {
  amount: bigint;
}

export function shieldMutationOptions(
  token: Token,
): MutationFactoryOptions<readonly ["zama.shield", Address], ShieldParams, TransactionResult> {
  return {
    mutationKey: ["zama.shield", token.address] as const,
    mutationFn: async ({ amount, ...rest }) => token.shield(amount, rest),
  };
}
