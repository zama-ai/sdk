import type { EncryptedValue } from "../relayer/relayer-sdk.types";
import type { WrappedToken } from "../token/wrapped-token";
import type { TransactionResult } from "../types";
import { ConfigurationError } from "../errors";
import type { MutationFactoryOptions } from "./factory-types";
import type { Address } from "viem";
/** Variables for {@link finalizeUnwrapMutationOptions}. */
export type FinalizeUnwrapParams =
  /** Identifier from an `UnwrapRequested` event. Preferred. */
  | { unwrapRequestId: EncryptedValue; burnAmount?: never }
  /**
   * Encrypted burn amount. Direct-call escape hatch for resuming an
   * unshield persisted by an older SDK version that did not record
   * `unwrapRequestId`; the orchestrated `WrappedToken.resumeUnshield()` flow
   * always rediscovers `unwrapRequestId` from the receipt and never reaches
   * this branch.
   */
  | { unwrapRequestId?: never; burnAmount: EncryptedValue };

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
      const encryptedValue = params.unwrapRequestId ?? params.burnAmount;
      if (!encryptedValue) {
        throw new ConfigurationError("finalizeUnwrap requires unwrapRequestId or burnAmount");
      }
      return token.finalizeUnwrap(encryptedValue);
    },
  };
}
