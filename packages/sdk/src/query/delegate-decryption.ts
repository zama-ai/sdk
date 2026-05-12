import type { Address } from "viem";
import type { TransactionResult } from "../types";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link delegateDecryptionMutationOptions}. */
export interface DelegateDecryptionParams {
  delegateAddress: Address;
  expirationDate?: Date;
}

export function delegateDecryptionMutationOptions(
  sdk: ZamaSDK,
  contractAddress: Address,
): MutationFactoryOptions<
  readonly ["zama.delegateDecryption", Address],
  DelegateDecryptionParams,
  TransactionResult
> {
  return {
    mutationKey: ["zama.delegateDecryption", contractAddress] as const,
    mutationFn: async ({ delegateAddress, expirationDate }) =>
      sdk.delegateDecryption({ contractAddress, delegateAddress, expirationDate }),
  };
}
