import type { ClearValue, EncryptedValue, PublicDecryptResult } from "../relayer/relayer-sdk.types";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";

export function decryptPublicValuesMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<
  readonly ["zama.decryptPublicValues"],
  EncryptedValue[],
  PublicDecryptResult
> {
  return {
    mutationKey: ["zama.decryptPublicValues"],
    mutationFn: async (handles) => sdk.decryption.decryptPublicValues(handles),
    onSuccess: (data, _variables, _onMutateResult, context) => {
      for (const [handle, value] of Object.entries(data.clearValues) as [
        EncryptedValue,
        ClearValue,
      ][]) {
        context.client.setQueryData(zamaQueryKeys.decryption.encryptedValue(handle), value);
      }
    },
  };
}
