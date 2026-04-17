import { SignerRequiredError } from "../errors/signer";
import type { Token } from "../token/token";
import type { TransactionResult, UnshieldCallbacks } from "../types";
import type { MutationFactoryOptions } from "./factory-types";
import type { Address } from "viem";

/** Variables for {@link unshieldAllMutationOptions}. */
export interface UnshieldAllParams extends UnshieldCallbacks {}

export function unshieldAllMutationOptions(
  token: Token | undefined,
  tokenAddress: Address,
): MutationFactoryOptions<
  readonly ["zama.unshieldAll", Address],
  UnshieldAllParams | void,
  TransactionResult
> {
  return {
    mutationKey: ["zama.unshieldAll", tokenAddress] as const,
    mutationFn: async (params) => {
      if (!token) throw new SignerRequiredError("unshieldAll");
      return token.unshieldAll(params || undefined);
    },
  };
}
