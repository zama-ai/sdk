import type { EncryptParams } from "../node";
import type { EncryptResult } from "../relayer/types";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

/** Builds TanStack Query mutation options for {@link ZamaSDK.encrypt | encrypting} plaintext inputs into an encrypted payload. */
export function encryptMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<readonly ["zama.encrypt"], EncryptParams, EncryptResult> {
  return { mutationKey: ["zama.encrypt"], mutationFn: async (params) => sdk.encrypt(params) };
}
