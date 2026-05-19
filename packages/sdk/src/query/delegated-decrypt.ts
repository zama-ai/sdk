import type { Address } from "viem";
import type { ClearValueType, EncryptedValue } from "../relayer/relayer-sdk.types";
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
  Readonly<Record<EncryptedValue, ClearValueType>>
> {
  return {
    mutationKey: ["zama.delegatedDecrypt"],
    mutationFn: async (params) =>
      sdk.decryption.delegatedDecrypt(params.encryptedInputs, params.delegatorAddress),
  };
}
