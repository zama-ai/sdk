import type { Token } from "../token/token";
import type { TransactionResult } from "../types";
import type { MutationFactoryOptions } from "./factory-types";
import type { Address } from "viem";

/** Variables for {@link shieldETHMutationOptions}. */
export interface ShieldETHParams {
  amount: bigint;
  value?: bigint;
}

export function shieldETHMutationOptions(
  token: Token,
): MutationFactoryOptions<
  readonly ["zama.shieldETH", Address],
  ShieldETHParams,
  TransactionResult
> {
  return {
    mutationKey: ["zama.shieldETH", token.address] as const,
    mutationFn: async ({ amount, value }) => token.shieldETH(amount, value),
  };
}
