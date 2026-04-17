import { SignerRequiredError } from "../errors/signer";
import type { Handle } from "../relayer/relayer-sdk.types";
import type { Token } from "../token/token";
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
  token: Token | undefined,
  tokenAddress: Address,
): MutationFactoryOptions<
  readonly ["zama.finalizeUnwrap", Address],
  FinalizeUnwrapParams,
  TransactionResult
> {
  return {
    mutationKey: ["zama.finalizeUnwrap", tokenAddress] as const,
    mutationFn: async (params) => {
      if (!token) throw new SignerRequiredError("finalizeUnwrap");
      const handle = params.unwrapRequestId ?? params.burnAmountHandle;
      if (!handle) {
        throw new ConfigurationError("finalizeUnwrap requires unwrapRequestId or burnAmountHandle");
      }
      return token.finalizeUnwrap(handle);
    },
  };
}
