import { SignerRequiredError } from "../errors/signer";
import type { Token } from "../token/token";
import type { Address } from "viem";
import type { TransactionResult } from "../types";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link delegateDecryptionMutationOptions}. */
export interface DelegateDecryptionParams {
  delegateAddress: Address;
  expirationDate?: Date;
}

export function delegateDecryptionMutationOptions(
  token: Token | undefined,
  tokenAddress: Address,
): MutationFactoryOptions<
  readonly ["zama.delegateDecryption", Address],
  DelegateDecryptionParams,
  TransactionResult
> {
  return {
    mutationKey: ["zama.delegateDecryption", tokenAddress] as const,
    mutationFn: async ({ delegateAddress, expirationDate }) => {
      if (!token) throw new SignerRequiredError("delegateDecryption");
      return token.delegateDecryption({ delegateAddress, expirationDate });
    },
  };
}
