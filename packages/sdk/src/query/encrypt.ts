import type { EncryptValuesReturnType } from "@fhevm/sdk/actions/encrypt";
import type { EncryptParameters } from "../node";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

export function encryptMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<readonly ["zama.encrypt"], EncryptParameters, EncryptValuesReturnType> {
  return { mutationKey: ["zama.encrypt"], mutationFn: async (params) => sdk.encrypt(params) };
}
