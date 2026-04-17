import type { Handle } from "../relayer/relayer-sdk.types";
import type { Token } from "../token/token";
import type { TransactionResult } from "../types";
import type { MutationFactoryOptions } from "./factory-types";
import type { Address } from "viem";

/** Variables for {@link finalizeUnwrapMutationOptions}. */
export interface FinalizeUnwrapParams {
  unwrapRequestId: Handle;
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
    mutationFn: async ({ unwrapRequestId }) => token.finalizeUnwrap(unwrapRequestId),
  };
}
