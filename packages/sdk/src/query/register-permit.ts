import type { Hex } from "viem";
import type { PreparedPermit } from "../credentials/types";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

/** Parameters for {@link registerPermitMutationOptions}. */
export interface RegisterPermitParams {
  /** The payload `sdk.offline.preparePermit` returned. */
  prepared: PreparedPermit;
  /** The `eth_signTypedData_v4` signature over `prepared.eip712`. */
  signature: Hex;
}

/** Builds TanStack Query mutation options for {@link Permits.registerPermit | registering} a signed offline permit. */
export function registerPermitMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<readonly ["zama.registerPermit"], RegisterPermitParams, void> {
  return {
    mutationKey: ["zama.registerPermit"],
    mutationFn: ({ prepared, signature }) => sdk.permits.registerPermit(prepared, signature),
  };
}
