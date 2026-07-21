import type { WrappedToken } from "../token/wrapped-token";
import type { TransactionResult, WrapOptions } from "../types";
import type { MutationFactoryOptions } from "./factory-types";
import type { Address } from "viem";

/** Variables for {@link wrapMutationOptions}. */
export interface WrapParams extends WrapOptions {
  /** Amount of the public ERC-20 to wrap, in the token's base units. */
  amount: bigint;
}

/** Builds TanStack Query mutation options for {@link WrappedToken.wrap | wrapping} a public ERC-20 into its confidential form. @see {@link WrapParams} */
export function wrapMutationOptions(
  token: WrappedToken,
): MutationFactoryOptions<readonly ["zama.wrap", Address], WrapParams, TransactionResult> {
  return {
    mutationKey: ["zama.wrap", token.address] as const,
    mutationFn: async ({ amount, ...rest }) => token.wrap(amount, rest),
  };
}
