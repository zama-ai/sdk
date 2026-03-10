import type { Token } from "../token/token";
import type { Address } from "viem";
import type { TransactionResult } from "../token/token.types";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link delegateDecryptionMutationOptions}. */
export interface DelegateDecryptionParams {
  delegate: Address;
  options?: {
    expirationDate: Date;
  };
}

export function delegateDecryptionMutationOptions(
  token: Token,
): MutationFactoryOptions<
  readonly ["zama.delegateDecryption", Address],
  DelegateDecryptionParams,
  TransactionResult
> {
  return {
    mutationKey: ["zama.delegateDecryption", token.address] as const,
    mutationFn: async ({ delegate, options }) => token.delegateDecryption(delegate, options),
  };
}
