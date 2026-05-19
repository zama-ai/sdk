import type { EncryptedValue } from "../relayer/relayer-sdk.types";
import type { WrappedToken } from "../token/wrapped-token";
import type { TransactionResult } from "../types";
import { ConfigurationError } from "../errors";
import type { MutationFactoryOptions } from "./factory-types";
import type { Address } from "viem";
/** Variables for {@link finalizeUnwrapMutationOptions}. */
export type FinalizeUnwrapParams =
  /** Identifier from an `UnwrapRequested` event. Preferred. */
  | { unwrapRequestId: EncryptedValue; burnAmountHandle?: never }
  /**
   * Encrypted burn-amount handle. Used when resuming a pending unshield
   * serialized by an older SDK version that did not record `unwrapRequestId`.
   */
  | { unwrapRequestId?: never; burnAmountHandle: EncryptedValue };

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
