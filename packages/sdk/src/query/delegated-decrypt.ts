import type { Address } from "viem";
import type { ClearValue, EncryptedValue } from "../relayer/relayer-sdk.types";
import type { EncryptedInput } from "./user-decrypt";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

export interface DelegatedDecryptMutationParams {
  encryptedInputs: EncryptedInput[];
  delegatorAddress: Address;
}

export function delegatedDecryptMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<
  readonly ["zama.delegatedDecrypt"],
  DelegatedDecryptMutationParams,
  Readonly<Record<EncryptedValue, ClearValue>>
> {
  return {
    mutationKey: ["zama.delegatedDecrypt"],
    mutationFn: async (params) =>
      sdk.decryption.delegatedDecryptValuesFromPairs(
        params.encryptedInputs,
        params.delegatorAddress,
      ),
  };
}
