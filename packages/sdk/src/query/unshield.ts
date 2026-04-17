import { SignerRequiredError } from "../errors/signer";
import type { Token } from "../token/token";
import type { TransactionResult, UnshieldOptions } from "../types";
import type { MutationFactoryOptions } from "./factory-types";
import type { Address } from "viem";

/** Variables for {@link unshieldMutationOptions}. */
export interface UnshieldParams extends UnshieldOptions {
  amount: bigint;
}

export function unshieldMutationOptions(
  token: Token | undefined,
  tokenAddress: Address,
): MutationFactoryOptions<readonly ["zama.unshield", Address], UnshieldParams, TransactionResult> {
  return {
    mutationKey: ["zama.unshield", tokenAddress] as const,
    mutationFn: async ({ amount, ...options }) => {
      if (!token) throw new SignerRequiredError("unshield");
      return token.unshield(amount, options);
    },
  };
}
