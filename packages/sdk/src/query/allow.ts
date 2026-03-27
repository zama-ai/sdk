import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";
import type { StoredCredentials } from "../types";
import type { Address } from "viem";

export function allowMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<readonly ["zama.allow"], Address[], StoredCredentials> {
  return {
    mutationKey: ["zama.allow"],
    mutationFn: (contractAddresses) => sdk.credentials.allow(...contractAddresses),
  };
}
