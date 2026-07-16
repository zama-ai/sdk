import type { EncryptedValue } from "../relayer/types";
import type { WrappedToken } from "../token/wrapped-token";
import type { TransactionResult } from "../types";
import type { MutationFactoryOptions } from "./factory-types";
import type { Address } from "viem";
/** Variables for {@link finalizeUnwrapMutationOptions}. */
export type FinalizeUnwrapParams = {
  /** Identifier from an `UnwrapRequested` event. */
  unwrapRequestId: EncryptedValue;
};

export function finalizeUnwrapMutationOptions(
  token: WrappedToken,
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
