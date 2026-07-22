import type { Address } from "viem";
import type { WrappedToken } from "../token/wrapped-token";
import type { ShieldOptions, TransactionResult } from "../types";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link shieldMutationOptions}. */
export interface ShieldParams extends ShieldOptions {
  /** Amount of the public ERC-20 to shield, in the token's base units. */
  amount: bigint;
}

/** Builds TanStack Query mutation options for {@link WrappedToken.shield | shielding} a public ERC-20 into its confidential form. @see {@link ShieldParams} */
export function shieldMutationOptions(
  token: WrappedToken,
): MutationFactoryOptions<readonly ["zama.shield", Address], ShieldParams, TransactionResult> {
  return {
    mutationKey: ["zama.shield", token.address] as const,
    mutationFn: async ({ amount, ...rest }) => token.shield(amount, rest),
  };
}
