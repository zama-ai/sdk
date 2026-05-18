import type { Address } from "viem";
import type { ClearValueType, Handle } from "../relayer/relayer-sdk.types";
import type { DecryptHandle } from "./user-decrypt";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

export interface DelegatedUserDecryptMutationParams {
  handles: DecryptHandle[];
  delegatorAddress: Address;
}

export function delegatedDecryptMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<
  readonly ["zama.delegatedDecrypt"],
  DelegatedUserDecryptMutationParams,
  Readonly<Record<Handle, ClearValueType>>
> {
  return {
    mutationKey: ["zama.delegatedDecrypt"],
    mutationFn: async (params) =>
      sdk.decryption.delegatedDecrypt(params.handles, params.delegatorAddress),
  };
}
