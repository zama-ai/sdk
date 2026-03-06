import type { Address } from "../token/token.types";
import type { ZamaSDK } from "../token/zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

export function revokeMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<readonly ["zama.revoke"], Address[], void> {
  return {
    mutationKey: ["zama.revoke"],
    mutationFn: (tokenAddresses) => sdk.revoke(...tokenAddresses),
  };
}
