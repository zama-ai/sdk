import type {
  ClearValueType,
  DelegatedUserDecryptParams,
  Handle,
} from "../relayer/relayer-sdk.types";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

export function delegatedUserDecryptMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<
  readonly ["zama.delegatedUserDecrypt"],
  DelegatedUserDecryptParams,
  Readonly<Record<Handle, ClearValueType>>
> {
  return {
    mutationKey: ["zama.delegatedUserDecrypt"],
    mutationFn: async (params) => sdk.relayer.delegatedUserDecrypt(params),
  };
}
