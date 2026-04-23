import type { Address } from "../utils/address";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

export function revokeMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<readonly ["zama.revoke"], Address[], void> {
  return {
    mutationKey: ["zama.revoke"],
    mutationFn: (contractAddresses) => sdk.credentials.revoke(...contractAddresses),
  };
}
