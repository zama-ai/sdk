import type { WrappedToken } from "../token/wrapped-token";
import type { TransactionResult, UnshieldCallbacks } from "../types";
import type { MutationFactoryOptions } from "./factory-types";
import type { Address } from "viem";

/** Variables for {@link unshieldAllMutationOptions}. */
export interface UnshieldAllParams extends UnshieldCallbacks {}

/** Builds TanStack Query mutation options for {@link WrappedToken.unshieldAll | unshielding} the entire confidential balance back into the public ERC-20. @see {@link UnshieldAllParams} */
export function unshieldAllMutationOptions(
  token: WrappedToken,
): MutationFactoryOptions<
  readonly ["zama.unshieldAll", Address],
  UnshieldAllParams | void,
  TransactionResult
> {
  return {
    mutationKey: ["zama.unshieldAll", token.address] as const,
    mutationFn: async (params) => token.unshieldAll(params || undefined),
  };
}
