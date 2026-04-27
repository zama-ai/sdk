import type { EncryptParams, EncryptResult } from "../relayer/relayer-sdk.types";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

export function encryptMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<readonly ["zama.encrypt"], EncryptParams, EncryptResult> {
  return {
    mutationKey: ["zama.encrypt"],
    mutationFn: async (params) => sdk.encrypt(params),
  };
}
