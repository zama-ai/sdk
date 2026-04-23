import type { Address } from "../utils/address";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

export function allowMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<readonly ["zama.allow"], Address[], void> {
  return {
    mutationKey: ["zama.allow"],
    mutationFn: (contractAddresses) => sdk.allow(contractAddresses),
  };
}
