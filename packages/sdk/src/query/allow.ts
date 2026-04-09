import type { Address } from "viem";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

export function allowMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<readonly ["zama.allow"], Address[], void> {
  return {
    mutationKey: ["zama.allow"],
    mutationFn: async (contractAddresses) => {
      await sdk.credentials.allow(contractAddresses);
    },
  };
}
