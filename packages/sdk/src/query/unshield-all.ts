import type { Token } from "../token/token";
import type { Address, TransactionResult, UnshieldCallbacks } from "../token/token.types";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link unshieldAllMutationOptions}. */
export interface UnshieldAllParams {
  callbacks?: UnshieldCallbacks;
}

export function unshieldAllMutationOptions(
  token: Token,
): MutationFactoryOptions<
  readonly ["zama.unshieldAll", Address],
  UnshieldAllParams | void,
  TransactionResult
> {
  return {
    mutationKey: ["zama.unshieldAll", token.address] as const,
    mutationFn: async (params) => token.unshieldAll(params?.callbacks),
  };
}
