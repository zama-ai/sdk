import type { Token } from "../token/token";
import type { Address, TransactionResult } from "../token/token.types";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link shieldMutationOptions}. */
export interface ShieldParams {
  amount: bigint;
  fees?: bigint;
  approvalStrategy?: "max" | "exact" | "skip";
}

export function shieldMutationOptions(
  token: Token,
): MutationFactoryOptions<readonly ["shield", Address], ShieldParams, TransactionResult> {
  return {
    mutationKey: ["shield", token.address] as const,
    mutationFn: async ({ amount, fees, approvalStrategy }) =>
      token.shield(amount, { fees, approvalStrategy }),
  };
}
