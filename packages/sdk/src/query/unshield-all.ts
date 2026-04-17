import type { Token } from "../token/token";
import type { TransactionResult, UnshieldCallbacks } from "../types";
import type { MutationFactoryOptions } from "./factory-types";
import type { Address } from "viem";

/** Variables for {@link unshieldAllMutationOptions}. */
export interface UnshieldAllParams extends UnshieldCallbacks {}

export function unshieldAllMutationOptions(
  token: Token,
): MutationFactoryOptions<
  readonly ["zama.unshieldAll", Address],
  UnshieldAllParams | void,
  TransactionResult
> {
  return {
    mutationKey: ["zama.unshieldAll", token.address] as const,
    mutationFn: async (params) => {
      return token.unshieldAll(params || undefined);
    },
  };
}
