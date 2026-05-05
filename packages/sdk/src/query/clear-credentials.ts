import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

/** TanStack Query mutation factory for {@link ZamaSDK.clearCredentials}. */
export function clearCredentialsMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<readonly ["zama.clearCredentials"], void, void> {
  return {
    mutationKey: ["zama.clearCredentials"],
    mutationFn: () => sdk.clearCredentials(),
  };
}
