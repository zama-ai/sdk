import { SignerRequiredError } from "../errors/signer";
import type { Token } from "../token/token";
import type { TransactionResult } from "../types";
import type { MutationFactoryOptions } from "./factory-types";
import type { Address } from "viem";

/** Variables for {@link unwrapMutationOptions}. */
export interface UnwrapParams {
  amount: bigint;
}

export function unwrapMutationOptions(
  token: Token | undefined,
  tokenAddress: Address,
): MutationFactoryOptions<readonly ["zama.unwrap", Address], UnwrapParams, TransactionResult> {
  return {
    mutationKey: ["zama.unwrap", tokenAddress] as const,
    mutationFn: async ({ amount }) => {
      if (!token) throw new SignerRequiredError("unwrap");
      return token.unwrap(amount);
    },
  };
}
