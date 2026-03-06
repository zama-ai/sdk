import type { Token } from "../token/token";
import type { Address, ShieldCallbacks, TransactionResult } from "../token/token.types";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link shieldMutationOptions}. */
export interface ShieldParams {
  amount: bigint;
  fees?: bigint;
  approvalStrategy?: "max" | "exact" | "skip";
  /** Recipient address for the shielded tokens. Defaults to the connected wallet. */
  to?: Address;
  /** Optional progress callbacks for the multi-step shield flow. */
  callbacks?: ShieldCallbacks;
}

export function shieldMutationOptions(
  token: Token,
): MutationFactoryOptions<readonly ["zama.shield", Address], ShieldParams, TransactionResult> {
  return {
    mutationKey: ["zama.shield", token.address] as const,
    mutationFn: async ({ amount, fees, approvalStrategy, to, callbacks }) =>
      token.shield(amount, { fees, approvalStrategy, to, callbacks }),
  };
}
