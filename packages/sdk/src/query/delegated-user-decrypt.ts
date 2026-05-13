import type { Address } from "viem";
import type { ClearValueType, Handle } from "../relayer/relayer-sdk.types";
import type { DecryptHandle } from "./user-decrypt";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

export interface DelegatedUserDecryptMutationParams {
  handles: DecryptHandle[];
  delegatorAddress: Address;
}

export function delegatedUserDecryptMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<
  readonly ["zama.delegatedUserDecrypt"],
  DelegatedUserDecryptMutationParams,
  Readonly<Record<Handle, ClearValueType>>
> {
  return {
    mutationKey: ["zama.delegatedUserDecrypt"],
    mutationFn: async (params) =>
      sdk.decrypt.delegatedUser(params.handles, params.delegatorAddress),
  };
}
