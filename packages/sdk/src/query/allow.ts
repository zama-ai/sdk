import type { ZamaSDK } from "../token/zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";
import type { Address } from "viem";

export function allowMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<readonly ["zama.allow"], Address[], void> {
  return {
    mutationKey: ["zama.allow"],
    mutationFn: (tokenAddresses) => sdk.allow(...tokenAddresses),
  };
}
