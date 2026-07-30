import type { WrappedToken } from "../token/wrapped-token";
import type { UnwrapResult } from "../types";
import type { MutationFactoryOptions } from "./factory-types";
import type { Address } from "viem";

/** Variables for {@link unwrapMutationOptions}. */
export interface UnwrapParams {
  /** Amount of tokens to unwrap, in the token's base units. */
  amount: bigint;
}

/** Builds TanStack Query mutation options for {@link WrappedToken.unwrap | unwrapping} a confidential token (request phase of the two-phase unwrap). @see {@link UnwrapParams} */
export function unwrapMutationOptions(
  token: WrappedToken,
): MutationFactoryOptions<readonly ["zama.unwrap", Address], UnwrapParams, UnwrapResult> {
  return {
    mutationKey: ["zama.unwrap", token.address] as const,
    mutationFn: async ({ amount }) => token.unwrap(amount),
  };
}
