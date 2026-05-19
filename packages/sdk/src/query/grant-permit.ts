import type { Address } from "viem";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

export function grantPermitMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<readonly ["zama.grantPermit"], Address[], void> {
  return {
    mutationKey: ["zama.grantPermit"],
    mutationFn: (contractAddresses) => sdk.permits.grantPermit(contractAddresses),
  };
}
