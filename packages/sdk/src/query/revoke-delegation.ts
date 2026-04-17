import { SignerRequiredError } from "../errors/signer";
import type { Token } from "../token/token";
import type { Address } from "viem";
import type { TransactionResult } from "../types";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link revokeDelegationMutationOptions}. */
export interface RevokeDelegationParams {
  delegateAddress: Address;
}

export function revokeDelegationMutationOptions(
  token: Token | undefined,
  tokenAddress: Address,
): MutationFactoryOptions<
  readonly ["zama.revokeDelegation", Address],
  RevokeDelegationParams,
  TransactionResult
> {
  return {
    mutationKey: ["zama.revokeDelegation", tokenAddress] as const,
    mutationFn: async ({ delegateAddress }) => {
      if (!token) throw new SignerRequiredError("revokeDelegation");
      return token.revokeDelegation({ delegateAddress });
    },
  };
}
