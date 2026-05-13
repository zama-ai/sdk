import type { Handle } from "../relayer/relayer-sdk.types";
import type { WrappedToken } from "../token/wrapped-token";
import type { TransactionResult } from "../types";
import { ConfigurationError } from "../errors";
import type { MutationFactoryOptions } from "./factory-types";
import type { Address } from "viem";
/** Variables for {@link finalizeUnwrapMutationOptions}. */
export type FinalizeUnwrapParams =
  /** Preferred input from upgraded `UnwrapRequested` events. */
  | { unwrapRequestId: Handle; burnAmountHandle?: never }
  /** Legacy input from pre-upgrade `UnwrapRequested` events. */
  | { unwrapRequestId?: never; burnAmountHandle: Handle };

export function finalizeUnwrapMutationOptions(
  token: WrappedToken,
): MutationFactoryOptions<
  readonly ["zama.finalizeUnwrap", Address],
  FinalizeUnwrapParams,
  TransactionResult
> {
  return {
    mutationKey: ["zama.finalizeUnwrap", token.address] as const,
    mutationFn: async (params) => {
      const handle = params.unwrapRequestId ?? params.burnAmountHandle;
      if (!handle) {
        throw new ConfigurationError("finalizeUnwrap requires unwrapRequestId or burnAmountHandle");
      }
      return token.finalizeUnwrap(handle);
    },
  };
}
