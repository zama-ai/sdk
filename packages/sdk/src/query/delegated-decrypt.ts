import type { Address } from "viem";
import type { ClearValue, EncryptedValue } from "../relayer/relayer-sdk.types";
import type { EncryptedInput } from "./user-decrypt";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

export interface DelegatedDecryptValuesMutationParams {
  encryptedInputs: EncryptedInput[];
  delegatorAddress: Address;
}

export function delegatedDecryptValuesMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<
  readonly ["zama.delegatedDecryptValues"],
  DelegatedDecryptValuesMutationParams,
  Readonly<Record<EncryptedValue, ClearValue>>
> {
  return {
    mutationKey: ["zama.delegatedDecryptValues"],
    mutationFn: async (params) =>
      sdk.decryption.delegatedDecryptValues(params.encryptedInputs, params.delegatorAddress),
  };
}
