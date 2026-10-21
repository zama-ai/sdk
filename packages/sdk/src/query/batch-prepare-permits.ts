import type { PreparedPermit, PreparePermitRequest } from "../credentials/types";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

/** Builds TanStack Query mutation options for {@link Offline.batchPreparePermits | preparing} a batch of offline decryption permits. */
export function batchPreparePermitsMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<
  readonly ["zama.batchPreparePermits"],
  PreparePermitRequest,
  PreparedPermit[]
> {
  return {
    mutationKey: ["zama.batchPreparePermits"],
    mutationFn: (request) => sdk.offline.batchPreparePermits(request),
  };
}
