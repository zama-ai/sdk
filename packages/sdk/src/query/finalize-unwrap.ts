import type { Token } from "../token/token";
import type { TransactionResult } from "../types";
import type { MutationFactoryOptions } from "./factory-types";
import type { Address, Hex } from "viem";

/** Variables for {@link finalizeUnwrapMutationOptions}. */
export interface FinalizeUnwrapParams {
  unwrapRequestId: Hex;
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
