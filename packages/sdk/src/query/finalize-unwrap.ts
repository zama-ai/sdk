import type { Token } from "../token/token";
import type { TransactionResult } from "../types";
import type { MutationFactoryOptions } from "./factory-types";
import type { Address } from "viem";
import type { Handle } from "../relayer/relayer-sdk.types";
import { ConfigurationError } from "../errors";

/** Variables for {@link finalizeUnwrapMutationOptions}. */
export interface FinalizeUnwrapParams {
  /** Preferred input from upgraded `UnwrapRequested` events. */
  unwrapRequestId?: Handle;
  /** Legacy input from pre-upgrade `UnwrapRequested` events. */
  burnAmountHandle?: Handle;
}

export function finalizeUnwrapMutationOptions(
  token: Token,
): MutationFactoryOptions<
  readonly ["zama.finalizeUnwrap", Address],
  FinalizeUnwrapParams,
  TransactionResult
> {
  return {
    mutationKey: ["zama.finalizeUnwrap", token.address] as const,
    mutationFn: async ({ unwrapRequestId, burnAmountHandle }) => {
      const unwrapRequestIdOrAmount = unwrapRequestId ?? burnAmountHandle;
      if (unwrapRequestIdOrAmount === undefined) {
        throw new ConfigurationError("finalizeUnwrap requires unwrapRequestId or burnAmountHandle");
      }
      return token.finalizeUnwrap(unwrapRequestIdOrAmount);
    },
  };
}
