import type { EncryptParams, EncryptResult } from "../relayer/relayer-sdk.types";
import type { ZamaSDK } from "../token/zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

export function encryptMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<readonly ["encrypt"], EncryptParams, EncryptResult> {
  return {
    mutationKey: ["encrypt"],
    mutationFn: async (params) => sdk.relayer.encrypt(params),
  };
}
