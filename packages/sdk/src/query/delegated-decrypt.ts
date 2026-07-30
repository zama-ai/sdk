import type { Address } from "viem";
import type { ClearValue, EncryptedValue } from "../relayer/types";
import type { EncryptedInput } from "./user-decrypt";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link delegatedDecryptValuesMutationOptions}. */
export interface DelegatedDecryptValuesMutationParams {
  /** Encrypted values (with their contract addresses) to decrypt. */
  encryptedInputs: EncryptedInput[];
  /** Address of the account that delegated decryption rights to the connected wallet. */
  delegatorAddress: Address;
}

/** Builds TanStack Query mutation options for {@link Decryption.delegatedDecryptValues | decrypting} encrypted values via delegated decryption credentials. @see {@link DelegatedDecryptValuesMutationParams} */
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
