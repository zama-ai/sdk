import type { SignedPreparedPermit } from "../credentials/types";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

/** Parameters for {@link registerPermitMutationOptions}. */
export type RegisterPermitParams = SignedPreparedPermit;

/** Builds TanStack Query mutation options for {@link Permits.registerPermit | registering} a signed offline permit. */
export function registerPermitMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<readonly ["zama.registerPermit"], RegisterPermitParams, void> {
  return {
    mutationKey: ["zama.registerPermit"],
    mutationFn: ({ prepared, signature }) => sdk.permits.registerPermit(prepared, signature),
  };
}
