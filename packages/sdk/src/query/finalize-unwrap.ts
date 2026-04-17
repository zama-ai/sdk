import type { Handle } from "../relayer/relayer-sdk.types";
import type { Token } from "../token/token";
import type { TransactionResult } from "../types";
import type { MutationFactoryOptions } from "./factory-types";
import type { Address } from "viem";
/** Variables for {@link finalizeUnwrapMutationOptions}. */
export type FinalizeUnwrapParams =
  /** Preferred input from upgraded `UnwrapRequested` events. */
  | { unwrapRequestId: Handle }
  /** Legacy input from pre-upgrade `UnwrapRequested` events. */
  | { burnAmountHandle: Handle };

export function finalizeUnwrapMutationOptions(
  token: Token,
): MutationFactoryOptions<
  readonly ["zama.finalizeUnwrap", Address],
  FinalizeUnwrapParams,
  TransactionResult
> {
  return {
    mutationKey: ["zama.finalizeUnwrap", token.address] as const,
    mutationFn: async (params) => {
      const handle = "unwrapRequestId" in params ? params.unwrapRequestId : params.burnAmountHandle;
      return token.finalizeUnwrap(handle);
    },
  };
}
