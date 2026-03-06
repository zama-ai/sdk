import type { ZamaSDK } from "../token/zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

export function revokeSessionMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<readonly ["zama.revokeSession"], void, void> {
  return {
    mutationKey: ["zama.revokeSession"],
    mutationFn: () => sdk.revokeSession(),
  };
}
