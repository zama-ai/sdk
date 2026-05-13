import type { Address } from "viem";
import type { ClearSigningCallbacks, TransactionResult } from "../types";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link delegateDecryptionMutationOptions}. */
export interface DelegateDecryptionParams extends ClearSigningCallbacks {
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
    mutationFn: async ({ delegateAddress, expirationDate, onClearSigningIntent }) =>
      sdk.delegateDecryption({
        contractAddress,
        delegateAddress,
        expirationDate,
        onClearSigningIntent,
      }),
  };
}
