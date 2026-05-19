import type {
  ClearValueType,
  EncryptedValue,
  PublicDecryptResult,
} from "../relayer/relayer-sdk.types";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";

export function publicDecryptMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<readonly ["zama.publicDecrypt"], EncryptedValue[], PublicDecryptResult> {
  return {
    mutationKey: ["zama.publicDecrypt"],
    mutationFn: async (handles) => sdk.decryption.publicDecrypt(handles),
    onSuccess: (data, _variables, _onMutateResult, context) => {
      for (const [handle, value] of Object.entries(data.clearValues) as [
        EncryptedValue,
        ClearValueType,
      ][]) {
        context.client.setQueryData(zamaQueryKeys.decryption.encryptedValue(handle), value);
      }
    },
  };
}
