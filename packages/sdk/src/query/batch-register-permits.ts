import type { SignedPreparedPermit } from "../credentials/types";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

/** Builds TanStack Query mutation options for {@link Permits.batchRegisterPermits | registering} a list of signed offline permits. */
export function batchRegisterPermitsMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<
  readonly ["zama.batchRegisterPermits"],
  readonly SignedPreparedPermit[],
  void
> {
  return {
    mutationKey: ["zama.batchRegisterPermits"],
    mutationFn: (permits) => sdk.permits.batchRegisterPermits(permits),
  };
}
