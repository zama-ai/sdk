import type { PreparedPermit, PreparePermitRequest } from "../credentials/types";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

/** Builds TanStack Query mutation options for {@link Offline.preparePermit | preparing} an offline decryption permit. */
export function preparePermitMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<readonly ["zama.preparePermit"], PreparePermitRequest, PreparedPermit> {
  return {
    mutationKey: ["zama.preparePermit"],
    mutationFn: (request) => sdk.offline.preparePermit(request),
  };
}
